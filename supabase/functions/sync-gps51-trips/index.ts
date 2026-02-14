import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";
import {
  parseGps51TimestampToUTC,
  formatDateForGps51,
  logTimezoneConversion,
  TIMEZONES,
} from "../_shared/timezone-utils.ts";
import { normalizeSpeed } from "../_shared/telemetry-normalizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Sync GPS51 Trips - Direct API Sync for 100% Accuracy with Lagos Timezone
 *
 * This function fetches trip data directly from GPS51's querytrips API (Section 6)
 * and stores it WITHOUT any transformations to ensure 100% match with GPS51 platform.
 *
 * Timezone handling:
 * - GPS51 Platform: GMT+8 (China Standard Time)
 * - Database Storage: UTC (best practice)
 * - User Display: GMT+1 (West Africa Time - Lagos)
 *
 * Flow: GPS51 (GMT+8) → Convert to UTC → Store in DB → Frontend displays as Lagos (GMT+1)
 *
 * GPS51 API: action=querytrips
 * Purpose: Get exact trip data as shown on GPS51 platform
 *
 * No calculations, no transformations, just direct storage with timezone conversion.
 */

/**
 * Convert GPS51 trip data to database format
 * Handles timezone conversion: GPS51 (GMT+8) → UTC for database storage
 * NO TRANSFORMATIONS - Just unit conversions, timezone conversion, and field mapping
 */
function toNumberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    // Defensive: tolerate simple "1,234.56" formatting.
    const cleaned = s.replace(/,/g, "");
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toIntOrNull(raw: unknown): number | null {
  const n = toNumberOrNull(raw);
  if (n === null) return null;
  return Math.round(n);
}

function normalizeSpeedOrNull(rawSpeed: unknown): number | null {
  if (rawSpeed === null || rawSpeed === undefined) return null;
  if (typeof rawSpeed === "string" && rawSpeed.trim() === "") return null;
  // normalizeSpeed is defensive and handles string values too.
  return normalizeSpeed(rawSpeed as any);
}

function convertGps51TripToDb(trip: any, deviceId: string) {
  // Parse timestamps from GPS51 (GMT+8) and convert to UTC
  const startTime = parseGps51TimestampToUTC(trip.starttime || trip.starttime_str);
  const endTime = parseGps51TimestampToUTC(trip.endtime || trip.endtime_str);

  // Log timezone conversion for debugging (only for first trip)
  if (startTime) {
    logTimezoneConversion('Trip Start Time', trip.starttime || trip.starttime_str, startTime);
  }

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
  // DB column is integer; GPS51 often returns strings/decimals. Round to nearest meter.
  const distanceMeters = toIntOrNull(trip.distance ?? trip.totaldistance);

  // GPS51 speed fields (already in correct units)
  // maxspeed and avgspeed are in m/h, convert to km/h using standard normalizer
  const maxSpeedKmh = normalizeSpeedOrNull(
    trip.maxspeed ??
      trip.totalmaxspeed ??
      trip.maximumspeed ??
      trip.totalmaximumspeed ??
      trip.max_speed
  );
  const avgSpeedKmh = normalizeSpeedOrNull(
    trip.avgspeed ??
      trip.totalaveragespeed ??
      trip.averagespeed ??
      trip.avg_speed ??
      trip.avgspeed_kmh
  );

  return {
    device_id: deviceId,
    start_time: startTime,  // UTC timestamp
    end_time: endTime,      // UTC timestamp
    // GPS51 sometimes returns strings; DB columns are numeric.
    start_latitude: toNumberOrNull(trip.startlat ?? trip.startlatitude),
    start_longitude: toNumberOrNull(trip.startlon ?? trip.startlongitude),
    end_latitude: toNumberOrNull(trip.endlat ?? trip.endlatitude),
    end_longitude: toNumberOrNull(trip.endlon ?? trip.endlongitude),
    distance_meters: distanceMeters,
    avg_speed_kmh: avgSpeedKmh,
    max_speed_kmh: maxSpeedKmh,
    duration_seconds: durationSeconds,
    gps51_raw_data: trip, // Store complete GPS51 response for debugging
  };
}

/**
 * Convert normalized GPS51 trip payload to the app's primary trip table schema.
 * This is a safety fallback when DB trigger sync (gps51_trips -> vehicle_trips) is missing/broken.
 */
function convertGps51TripToVehicleTrip(trip: ReturnType<typeof convertGps51TripToDb>) {
  // Some providers may omit end time; keep row valid for strict schemas.
  const safeEndTime = trip.end_time || trip.start_time;
  const distanceKm = trip.distance_meters ? Number(trip.distance_meters) / 1000 : 0;

  return {
    device_id: trip.device_id,
    start_time: trip.start_time,
    end_time: safeEndTime,
    start_latitude: trip.start_latitude ?? 0,
    start_longitude: trip.start_longitude ?? 0,
    end_latitude: trip.end_latitude ?? 0,
    end_longitude: trip.end_longitude ?? 0,
    distance_km: Math.round(distanceKm * 100) / 100,
    max_speed: trip.max_speed_kmh ?? null,
    avg_speed: trip.avg_speed_kmh ?? null,
    duration_seconds: trip.duration_seconds ?? 0,
    source: 'gps51',
  };
}

/**
 * Write to vehicle_trips with compatibility fallbacks for differing unique constraints.
 */
async function upsertVehicleTrip(supabase: any, trip: ReturnType<typeof convertGps51TripToDb>) {
  const vehicleTrip = convertGps51TripToVehicleTrip(trip);

  // Preferred: current schema with unique (device_id, start_time)
  let { error } = await supabase
    .from('vehicle_trips')
    .upsert(vehicleTrip, {
      onConflict: 'device_id,start_time',
      ignoreDuplicates: false,
    });

  if (!error) return { success: true as const };

  // Fallback: older schema with unique (device_id, start_time, end_time)
  const fallback = await supabase
    .from('vehicle_trips')
    .upsert(vehicleTrip, {
      onConflict: 'device_id,start_time,end_time',
      ignoreDuplicates: false,
    });

  if (!fallback.error) return { success: true as const };

  // Last fallback: raw insert to avoid total disconnect.
  const insertAttempt = await supabase
    .from('vehicle_trips')
    .insert(vehicleTrip);

  if (!insertAttempt.error) return { success: true as const };

  return {
    success: false as const,
    error: insertAttempt.error || fallback.error || error,
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
    const { deviceid, begintime, endtime, timezone = TIMEZONES.LAGOS } = await req.json();

    if (!deviceid) {
      throw new Error('Missing required parameter: deviceid');
    }

    // Default to last 7 days if no time range specified
    // Input times are assumed to be in Lagos timezone (GMT+1) unless specified
    const now = new Date();
    const defaultBeginTime = new Date(now);
    defaultBeginTime.setDate(defaultBeginTime.getDate() - 7);

    const begin = begintime ? new Date(begintime) : defaultBeginTime;
    const end = endtime ? new Date(endtime) : now;

    // Get GPS51 credentials
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL');
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret');

    const { token, serverid } = await getValidGps51Token(supabase);

    // Format times for GPS51 API (converts to GPS51 timezone GMT+8)
    // Input is in UTC, formatDateForGps51 converts UTC → GMT+8
    const beginTimeStr = formatDateForGps51(begin, TIMEZONES.UTC);
    const endTimeStr = formatDateForGps51(end, TIMEZONES.UTC);

    console.log(`[sync-gps51-trips] Fetching trips for ${deviceid}`);
    console.log(`  Input range (UTC): ${begin.toISOString()} to ${end.toISOString()}`);
    console.log(`  GPS51 range (GMT+8): ${beginTimeStr} to ${endTimeStr}`);

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
        timezone: TIMEZONES.GPS51, // GPS51 uses GMT+8
      }
    );

    if (result.status !== 0) {
              throw new Error(`GPS51 querytrips error: ${result.cause || 'Unknown error'} (status: ${result.status})`);
            }

            // DEBUG LOGGING: Log full raw response to diagnose "0 records" issue
            console.log(`[sync-gps51-trips] RAW GPS51 RESPONSE for ${deviceid}:`, JSON.stringify(result));

    // CRITICAL FIX: GPS51 querytrips returns trips in 'totaltrips' (or sometimes 'records')
    const records = result.totaltrips || result.records || [];
    console.log(`[sync-gps51-trips] Received ${records.length} trip records from GPS51 (checked totaltrips + records)`);

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
    let errors = 0;
    let gps51TripsUpsertedSuccess = 0;
    let vehicleTripsUpserted = 0;
    let vehicleTripsErrors = 0;
    let firstInsertError: { message?: string; code?: string; details?: string; hint?: string } | null = null;

    for (const trip of tripsToInsert) {
      try {
        const { error, data } = await supabase
          .from('gps51_trips')
          .upsert(trip, {
            onConflict: 'device_id,start_time',
            ignoreDuplicates: false, // Update if exists
          })
          .select('id');

        if (error) {
          console.error('[sync-gps51-trips] Insert error:', error);
          if (!firstInsertError) {
            firstInsertError = {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            };
          }
          errors++;
        } else {
          // PostgREST doesn't reliably tell us insert vs update; track success count only.
          gps51TripsUpsertedSuccess++;
        }

        // Safety fallback: also sync directly into vehicle_trips.
        const vehicleTripResult = await upsertVehicleTrip(supabase, trip);
        if (vehicleTripResult.success) {
          vehicleTripsUpserted++;
        } else {
          vehicleTripsErrors++;
          console.error('[sync-gps51-trips] vehicle_trips upsert error:', vehicleTripResult.error);
        }
      } catch (err) {
        console.error('[sync-gps51-trips] Insert exception:', err);
        if (!firstInsertError) {
          firstInsertError = { message: err instanceof Error ? err.message : String(err) };
        }
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
    const sampleMsg = firstInsertError?.message ? ` Sample error: ${firstInsertError.message}${firstInsertError.code ? ` (code=${firstInsertError.code})` : ""}` : "";
    const likelyTypeMismatch =
      firstInsertError?.message &&
      (firstInsertError.message.toLowerCase().includes("invalid input syntax") ||
        firstInsertError.message.toLowerCase().includes("type integer") ||
        firstInsertError.message.toLowerCase().includes("integer"));
    const suffix = likelyTypeMismatch ? " Likely type mismatch: distance_meters must be an integer." : "";

    await supabase
      .from('gps51_sync_status')
      .upsert({
        device_id: deviceid,
        sync_status: errors > 0 ? 'error' : 'completed',
        last_trip_sync_at: new Date().toISOString(),
        last_trip_synced: latestTrip,
        trips_synced_count: gps51TripsUpsertedSuccess,
        trip_sync_error: errors > 0 ? `Failed to insert ${errors} trips.${sampleMsg}${suffix}` : null,
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
        // Keep legacy fields for client compatibility (toast uses inserted+updated).
        // Note: PostgREST doesn't reliably distinguish inserts vs updates for upsert responses.
        trips_inserted: gps51TripsUpsertedSuccess,
        trips_updated: 0,
        trips_upserted_success: gps51TripsUpsertedSuccess,
        errors,
        insert_error_sample: firstInsertError,
        vehicle_trips_upserted: vehicleTripsUpserted,
        vehicle_trips_errors: vehicleTripsErrors,
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
