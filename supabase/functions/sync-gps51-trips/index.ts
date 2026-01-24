import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Sync GPS51 Trips - Direct API Sync for 100% Accuracy
 *
 * This function fetches trip data directly from GPS51's querytrips API (Section 6)
 * and stores it WITHOUT any transformations to ensure 100% match with GPS51 platform.
 *
 * GPS51 API: action=querytrips
 * Purpose: Get exact trip data as shown on GPS51 platform
 *
 * No calculations, no transformations, just direct storage.
 */

/**
 * Parse GPS51 timestamp to ISO8601
 * GPS51 returns timestamps in milliseconds (or seconds if < year 2000)
 */
function parseGps51Timestamp(ts: any): string | null {
  if (!ts) return null;

  // If string format "yyyy-MM-dd HH:mm:ss", parse it
  if (typeof ts === 'string' && ts.includes('-')) {
    try {
      // GPS51 timestamps are in GMT+8, convert to UTC
      const date = new Date(ts + ' GMT+0800');
      return date.toISOString();
    } catch (e) {
      console.warn(`[sync-gps51-trips] Failed to parse timestamp string: ${ts}`, e);
      return null;
    }
  }

  // If number, check if seconds or milliseconds
  const num = typeof ts === 'number' ? ts : parseInt(ts);
  if (isNaN(num)) return null;

  // If less than year 2000 in milliseconds, it's probably seconds
  const threshold = Date.parse('2000-01-01T00:00:00Z');
  const timestamp = num < threshold ? num * 1000 : num;

  try {
    return new Date(timestamp).toISOString();
  } catch (e) {
    console.warn(`[sync-gps51-trips] Failed to parse timestamp number: ${ts}`, e);
    return null;
  }
}

/**
 * Format date for GPS51 API (yyyy-MM-dd HH:mm:ss)
 */
function formatDateForGps51(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Convert GPS51 trip data to database format
 * NO TRANSFORMATIONS - Just unit conversions and field mapping
 */
function convertGps51TripToDb(trip: any, deviceId: string) {
  // Parse timestamps
  const startTime = parseGps51Timestamp(trip.starttime || trip.starttime_str);
  const endTime = parseGps51Timestamp(trip.endtime || trip.endtime_str);

  // Calculate duration in seconds (if both times available)
  let durationSeconds = null;
  if (startTime && endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    durationSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);
  }

  // GPS51 distance field priority:
  // 1. distance (accumulated path distance - most accurate)
  // 2. totaldistance (alternative field name)
  const distanceMeters = trip.distance || trip.totaldistance || null;

  // GPS51 speed fields (already in correct units)
  // maxspeed and avgspeed are in m/h, convert to km/h
  const maxSpeedKmh = trip.maxspeed ? trip.maxspeed / 1000 : null;
  const avgSpeedKmh = trip.avgspeed ? trip.avgspeed / 1000 : null;

  return {
    device_id: deviceId,
    start_time: startTime,
    end_time: endTime,
    start_latitude: trip.startlat || trip.startlatitude || null,
    start_longitude: trip.startlon || trip.startlongitude || null,
    end_latitude: trip.endlat || trip.endlatitude || null,
    end_longitude: trip.endlon || trip.endlongitude || null,
    distance_meters: distanceMeters,
    avg_speed_kmh: avgSpeedKmh,
    max_speed_kmh: maxSpeedKmh,
    duration_seconds: durationSeconds,
    gps51_raw_data: trip, // Store complete GPS51 response for debugging
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
    const { deviceid, begintime, endtime, timezone = 8 } = await req.json();

    if (!deviceid) {
      throw new Error('Missing required parameter: deviceid');
    }

    // Default to last 7 days if no time range specified
    const now = new Date();
    const defaultBeginTime = new Date(now);
    defaultBeginTime.setDate(defaultBeginTime.getDate() - 7);

    const begin = begintime ? new Date(begintime) : defaultBeginTime;
    const end = endtime ? new Date(endtime) : now;

    // Get GPS51 credentials
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL');
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret');

    const { token, serverid } = await getValidGps51Token(supabase);

    // Format times for GPS51 API
    const beginTimeStr = formatDateForGps51(begin);
    const endTimeStr = formatDateForGps51(end);

    console.log(`[sync-gps51-trips] Fetching trips for ${deviceid} from ${beginTimeStr} to ${endTimeStr}`);

    // Call GPS51 querytrips API (Section 6)
    const result = await callGps51WithRateLimit(
      supabase,
      DO_PROXY_URL,
      'querytrips',
      token,
      serverid,
      {
        deviceid,
        begintime: beginTimeStr,
        endtime: endTimeStr,
        timezone, // GMT+8 default
      }
    );

    if (result.status !== 0) {
      throw new Error(`GPS51 querytrips error: ${result.cause || 'Unknown error'} (status: ${result.status})`);
    }

    const records = result.records || [];
    console.log(`[sync-gps51-trips] Received ${records.length} trip records from GPS51`);

    // Convert GPS51 data to database format
    const tripsToInsert = records
      .map((trip: any) => convertGps51TripToDb(trip, deviceid))
      .filter((trip: any) => trip.start_time); // Only insert trips with valid start time

    console.log(`[sync-gps51-trips] Inserting ${tripsToInsert.length} trips into database`);

    // Update sync status - mark as syncing
    await supabase
      .from('gps51_sync_status')
      .upsert({
        device_id: deviceid,
        sync_status: 'syncing',
        last_trip_sync_at: new Date().toISOString(),
      }, {
        onConflict: 'device_id',
      });

    // Insert trips with conflict handling (upsert on device_id + start_time)
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const trip of tripsToInsert) {
      try {
        const { error, data } = await supabase
          .from('gps51_trips')
          .upsert(trip, {
            onConflict: 'device_id,start_time',
            ignoreDuplicates: false, // Update if exists
          })
          .select();

        if (error) {
          console.error('[sync-gps51-trips] Insert error:', error);
          errors++;
        } else {
          if (data && data.length > 0) {
            inserted++;
          } else {
            updated++;
          }
        }
      } catch (err) {
        console.error('[sync-gps51-trips] Insert exception:', err);
        errors++;
      }
    }

    // Get the latest trip time synced
    const latestTrip = tripsToInsert.length > 0
      ? tripsToInsert.reduce((latest, trip) =>
          trip.end_time && trip.end_time > (latest || '') ? trip.end_time : latest,
          null as string | null
        )
      : null;

    // Update sync status - mark as completed
    await supabase
      .from('gps51_sync_status')
      .upsert({
        device_id: deviceid,
        sync_status: errors > 0 ? 'error' : 'completed',
        last_trip_sync_at: new Date().toISOString(),
        last_trip_synced: latestTrip,
        trips_synced_count: inserted + updated,
        trip_sync_error: errors > 0 ? `Failed to insert ${errors} trips` : null,
      }, {
        onConflict: 'device_id',
      });

    return new Response(
      JSON.stringify({
        success: true,
        device_id: deviceid,
        time_range: {
          begin: beginTimeStr,
          end: endTimeStr,
        },
        records_received: records.length,
        trips_inserted: inserted,
        trips_updated: updated,
        errors,
        latest_trip_synced: latestTrip,
        summary: {
          total_distance_km: tripsToInsert.reduce((sum, t) => sum + (t.distance_meters || 0), 0) / 1000,
          total_trips: tripsToInsert.length,
          avg_distance_km: tripsToInsert.length > 0
            ? tripsToInsert.reduce((sum, t) => sum + (t.distance_meters || 0), 0) / 1000 / tripsToInsert.length
            : 0,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[sync-gps51-trips] Error:', error);

    // Update sync status - mark as error
    try {
      const body = await req.json();
      if (body.deviceid) {
        await supabase
          .from('gps51_sync_status')
          .upsert({
            device_id: body.deviceid,
            sync_status: 'error',
            trip_sync_error: error instanceof Error ? error.message : 'Unknown error',
          }, {
            onConflict: 'device_id',
          });
      }
    } catch (e) {
      // Ignore error update failures
    }

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
