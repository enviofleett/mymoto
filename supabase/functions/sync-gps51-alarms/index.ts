import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";
import {
  parseGps51TimestampToUTC,
  logTimezoneConversion,
  TIMEZONES,
} from "../_shared/timezone-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Sync GPS51 Alarms - Direct API Sync for 100% Accuracy with Lagos Timezone
 *
 * This function fetches position data from GPS51's lastposition API (Section 4.1)
 * and extracts alarm data to ensure 100% match with GPS51 platform.
 *
 * Timezone handling:
 * - GPS51 Platform: GMT+8 (China Standard Time)
 * - Database Storage: UTC (best practice)
 * - User Display: GMT+1 (West Africa Time - Lagos)
 *
 * Flow: GPS51 (GMT+8) → Convert to UTC → Store in DB → Frontend displays as Lagos (GMT+1)
 *
 * GPS51 API: action=lastposition
 * Alarm Fields: alarm, stralarm, stralarmsen, videoalarm, strvideoalarm, strvideoalarmen
 *
 * No calculations, just direct extraction, timezone conversion, and storage.
 */

/**
 * Determine alarm severity based on alarm code
 * JT808 protocol alarm codes (GPS51 documentation Section 4.1)
 */
function determineAlarmSeverity(alarmCode: number, alarmDescription: string): string {
  if (!alarmCode || alarmCode === 0) return 'info';

  const desc = (alarmDescription || '').toLowerCase();

  // Critical alarms
  if (
    desc.includes('sos') ||
    desc.includes('emergency') ||
    desc.includes('crash') ||
    desc.includes('rollover') ||
    desc.includes('fuel theft') ||
    desc.includes('steal')
  ) {
    return 'critical';
  }

  // Error alarms
  if (
    desc.includes('power off') ||
    desc.includes('power cut') ||
    desc.includes('antenna') ||
    desc.includes('tampering') ||
    desc.includes('removal')
  ) {
    return 'error';
  }

  // Warning alarms
  if (
    desc.includes('overspeed') ||
    desc.includes('fatigue') ||
    desc.includes('geofence') ||
    desc.includes('idle') ||
    desc.includes('harsh')
  ) {
    return 'warning';
  }

  // Default to info
  return 'info';
}

/**
 * Convert GPS51 position data to alarm record
 * Handles timezone conversion: GPS51 (GMT+8) → UTC for database storage
 */
function extractAlarmFromPosition(position: any) {
  const alarmCode = position.alarm || 0;
  const alarmDescription = position.stralarm || '';
  const alarmDescriptionEn = position.stralarmsen || '';

  // Only process if there's an active alarm
  if (!alarmCode || alarmCode === 0) {
    return null;
  }

  // Parse timestamp from GPS51 (GMT+8) and convert to UTC
  // Prefer validpoistiontime for GPS fix, fallback to updatetime
  const alarmTime = parseGps51TimestampToUTC(position.validpoistiontime || position.updatetime);
  if (!alarmTime) {
    console.warn('[sync-gps51-alarms] No valid timestamp for alarm, skipping');
    return null;
  }

  // Log timezone conversion for debugging (first alarm only)
  if (alarmTime) {
    logTimezoneConversion('Alarm Time', position.validpoistiontime || position.updatetime, alarmTime);
  }

  // Determine severity
  const severity = determineAlarmSeverity(alarmCode, alarmDescriptionEn || alarmDescription);

  // Extract video alarms if present
  const videoAlarmCode = position.videoalarm || null;
  const videoAlarmDescription = position.strvideoalarm || null;
  const videoAlarmDescriptionEn = position.strvideoalarmen || null;

  // Speed conversion (m/h to km/h)
  const speedKmh = position.speed ? position.speed / 1000 : null;

  return {
    device_id: position.deviceid,
    alarm_code: alarmCode,
    alarm_description: alarmDescription,
    alarm_description_en: alarmDescriptionEn,
    video_alarm_code: videoAlarmCode,
    video_alarm_description: videoAlarmDescription,
    video_alarm_description_en: videoAlarmDescriptionEn,
    latitude: position.callat || position.lat || null,
    longitude: position.callon || position.lon || null,
    speed_kmh: speedKmh,
    altitude: position.altitude || null,
    heading: position.course || null,
    severity,
    alarm_time: alarmTime,  // UTC timestamp
    gps51_raw_data: position, // Store complete position data
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { deviceids, lastquerypositiontime } = await req.json();

    // Get all active vehicles if no deviceids specified
    let deviceList: string[] = [];
    if (deviceids && Array.isArray(deviceids) && deviceids.length > 0) {
      deviceList = deviceids;
    } else {
      // Get all vehicles from database
      const { data: vehicles, error } = await supabase
        .from('vehicles')
        .select('device_id')
        .eq('vehicle_status', 'active');

      if (error) throw error;
      deviceList = vehicles.map(v => v.device_id);
    }

    if (deviceList.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No devices to sync',
          alarms_synced: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[sync-gps51-alarms] Syncing alarms for ${deviceList.length} devices`);

    // Get GPS51 credentials
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL');
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret');

    const { token, serverid } = await getValidGps51Token(supabase);

    // Call GPS51 lastposition API (Section 4.1)
    const result = await callGps51WithRateLimit(
      supabase,
      DO_PROXY_URL,
      'lastposition',
      token,
      serverid,
      {
        deviceids: deviceList,
        lastquerypositiontime: lastquerypositiontime || 0,
      }
    );

    if (result.status !== 0) {
      throw new Error(`GPS51 lastposition error: ${result.cause || 'Unknown error'} (status: ${result.status})`);
    }

    const records = result.records || [];
    console.log(`[sync-gps51-alarms] Received ${records.length} position records from GPS51`);

    // Extract alarms from position data
    const alarms = records
      .map((position: any) => extractAlarmFromPosition(position))
      .filter((alarm: any) => alarm !== null); // Only include records with active alarms

    console.log(`[sync-gps51-alarms] Found ${alarms.length} active alarms`);

    if (alarms.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active alarms found',
          positions_checked: records.length,
          alarms_synced: 0,
          lastquerypositiontime: result.lastquerypositiontime || Date.now(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Insert alarms with conflict handling (upsert on device_id + alarm_time + alarm_code)
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const alarm of alarms) {
      try {
        // Update sync status - mark as syncing
        await supabase
          .from('gps51_sync_status')
          .upsert({
            device_id: alarm.device_id,
            sync_status: 'syncing',
            last_alarm_sync_at: new Date().toISOString(),
          }, {
            onConflict: 'device_id',
          });

        const { error, data } = await supabase
          .from('gps51_alarms')
          .upsert(alarm, {
            onConflict: 'device_id,alarm_time,alarm_code',
            ignoreDuplicates: false, // Update if exists
          })
          .select();

        if (error) {
          console.error('[sync-gps51-alarms] Insert error:', error);
          errors++;
        } else {
          if (data && data.length > 0) {
            inserted++;
          } else {
            updated++;
          }
        }
      } catch (err) {
        console.error('[sync-gps51-alarms] Insert exception:', err);
        errors++;
      }
    }

    // Update sync status for all devices
    for (const deviceId of deviceList) {
      const deviceAlarms = alarms.filter(a => a.device_id === deviceId);
      const latestAlarmTime = deviceAlarms.length > 0
        ? deviceAlarms.reduce((latest, alarm) =>
            alarm.alarm_time > (latest || '') ? alarm.alarm_time : latest,
            null as string | null
          )
        : null;

      await supabase
        .from('gps51_sync_status')
        .upsert({
          device_id: deviceId,
          sync_status: errors > 0 ? 'error' : 'completed',
          last_alarm_sync_at: new Date().toISOString(),
          last_alarm_synced: latestAlarmTime,
          alarms_synced_count: deviceAlarms.length,
          alarm_sync_error: errors > 0 ? `Failed to insert ${errors} alarms` : null,
        }, {
          onConflict: 'device_id',
        });
    }

    // Calculate severity breakdown
    const severityCounts = alarms.reduce((counts: any, alarm: any) => {
      counts[alarm.severity] = (counts[alarm.severity] || 0) + 1;
      return counts;
    }, {});

    return new Response(
      JSON.stringify({
        success: true,
        positions_checked: records.length,
        alarms_found: alarms.length,
        alarms_inserted: inserted,
        alarms_updated: updated,
        errors,
        lastquerypositiontime: result.lastquerypositiontime || Date.now(),
        severity_breakdown: severityCounts,
        devices_synced: deviceList.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[sync-gps51-alarms] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
