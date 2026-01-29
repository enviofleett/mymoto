import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFeatureFlag } from "../_shared/feature-flags.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PositionPoint {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  gps_time: string;
  ignition_on: boolean | null;
}

interface TripData {
  device_id: string;
  start_time: string;
  end_time: string;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  distance_km: number;
  max_speed: number | null;
  avg_speed: number | null;
  duration_seconds: number;
  source: string;  // CRITICAL: Track data source for filtering
}

// Haversine formula to calculate distance between two GPS points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Process position history for a single device and extract trips
function extractTripsFromHistory(positions: PositionPoint[]): TripData[] {
  if (positions.length < 3) return [];

  const trips: TripData[] = [];
  let currentTrip: { points: PositionPoint[] } | null = null;
  const SPEED_THRESHOLD = 2; // km/h - consider moving if speed > 2
  const MIN_TRIP_DISTANCE = 0.3; // km - minimum trip distance to record
  const STOP_DURATION_MS = 3 * 60 * 1000; // 3 minutes of no movement = trip end

  for (let i = 0; i < positions.length; i++) {
    const point = positions[i];
    const prevPoint = i > 0 ? positions[i - 1] : null;

    const isMoving = (point.speed ?? 0) > SPEED_THRESHOLD;
    const wasMoving = prevPoint && (prevPoint.speed ?? 0) > SPEED_THRESHOLD;

    // Check time gap between points
    const timeGap = prevPoint
      ? new Date(point.gps_time).getTime() - new Date(prevPoint.gps_time).getTime()
      : 0;

    // Start new trip
    if (isMoving && !currentTrip) {
      currentTrip = { points: [point] };
    }

    // Continue trip
    if (currentTrip && isMoving) {
      currentTrip.points.push(point);
    }

    // End trip conditions:
    // 1. Was moving, now stopped
    // 2. Large time gap (> stop duration)
    // 3. Last point in the data
    const shouldEndTrip =
      currentTrip &&
      ((wasMoving && !isMoving) ||
        timeGap > STOP_DURATION_MS ||
        i === positions.length - 1);

    if (shouldEndTrip && currentTrip && currentTrip.points.length >= 3) {
      const tripPoints = currentTrip.points;
      const startPoint = tripPoints[0];
      const endPoint = tripPoints[tripPoints.length - 1];

      // Calculate total distance
      let totalDistance = 0;
      let maxSpeed = 0;
      let totalSpeed = 0;
      let speedCount = 0;

      for (let j = 1; j < tripPoints.length; j++) {
        const p1 = tripPoints[j - 1];
        const p2 = tripPoints[j];
        const dist = calculateDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
        
        // Filter GPS jumps (unrealistic > 10km between consecutive points)
        if (dist < 10) {
          totalDistance += dist;
        }

        // Note: Speed appears to be stored * 1000 in some cases, normalize it
        const speed = p2.speed !== null && p2.speed > 0 
          ? (p2.speed > 1000 ? p2.speed / 1000 : p2.speed) 
          : 0;
        
        if (speed > 0 && speed < 200) { // Filter unrealistic speeds
          maxSpeed = Math.max(maxSpeed, speed);
          totalSpeed += speed;
          speedCount++;
        }
      }

      // Only record meaningful trips
      if (totalDistance >= MIN_TRIP_DISTANCE) {
        const startTime = new Date(startPoint.gps_time);
        const endTime = new Date(endPoint.gps_time);
        const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

        trips.push({
          device_id: startPoint.device_id,
          start_time: startPoint.gps_time,
          end_time: endPoint.gps_time,
          start_latitude: startPoint.latitude,
          start_longitude: startPoint.longitude,
          end_latitude: endPoint.latitude,
          end_longitude: endPoint.longitude,
          distance_km: Math.round(totalDistance * 100) / 100,
          max_speed: maxSpeed > 0 ? Math.round(maxSpeed * 10) / 10 : null,
          avg_speed: speedCount > 0 ? Math.round((totalSpeed / speedCount) * 10) / 10 : null,
          duration_seconds: durationSeconds,
          source: 'position_history',  // Mark as position_history-derived (NOT gps51)
        });
      }

      currentTrip = null;
    }

    // Reset trip if we weren't moving
    if (!isMoving && !wasMoving && currentTrip) {
      currentTrip = null;
    }
  }

  return trips;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[process-trips] Starting trip processing job");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { enabled: verboseLogs } = await getFeatureFlag(supabase, "sync_logging_verbose");
    const vlog = (...args: any[]) => { if (verboseLogs) console.log(...args) };

    // Parse request body for optional parameters
    let lookbackHours = 2; // Default: process last 2 hours
    let deviceIds: string[] | null = null;

    try {
      const body = await req.json();
      if (body.lookback_hours) {
        lookbackHours = Math.min(body.lookback_hours, 720); // Max 30 days (720 hours)
      }
      if (body.device_ids && Array.isArray(body.device_ids)) {
        deviceIds = body.device_ids;
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    const cutoffTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
    console.log(`[process-trips] Processing data since ${cutoffTime}`);
    vlog("[process-trips] params:", { lookbackHours, deviceIdsCount: deviceIds?.length ?? null });

    // Get distinct device IDs that have recent position data
    let devicesQuery = supabase
      .from("position_history")
      .select("device_id")
      .gte("gps_time", cutoffTime);

    if (deviceIds) {
      devicesQuery = devicesQuery.in("device_id", deviceIds);
    }

    const { data: deviceData, error: deviceError } = await devicesQuery;

    if (deviceError) {
      throw new Error(`Failed to get devices: ${deviceError.message}`);
    }

    // Get unique device IDs
    const uniqueDevices = [...new Set(deviceData?.map((d) => d.device_id).filter(Boolean))] as string[];
    console.log(`[process-trips] Found ${uniqueDevices.length} devices with recent data`);

    let totalTripsCreated = 0;
    let totalTripsSkipped = 0;
    const errors: string[] = [];

    // Process each device
    for (const deviceId of uniqueDevices) {
      try {
        // Fetch position history for this device
        const { data: positions, error: posError } = await supabase
          .from("position_history")
          .select("id, device_id, latitude, longitude, speed, heading, gps_time, ignition_on")
          .eq("device_id", deviceId)
          .gte("gps_time", cutoffTime)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .neq("latitude", 0)
          .neq("longitude", 0)
          .order("gps_time", { ascending: true });

        if (posError) {
          errors.push(`Device ${deviceId}: ${posError.message}`);
          continue;
        }

        if (!positions || positions.length < 3) {
          console.log(`[process-trips] Device ${deviceId}: insufficient data (${positions?.length || 0} points)`);
          continue;
        }

        // Extract trips from position data
        const trips = extractTripsFromHistory(positions as PositionPoint[]);
        console.log(`[process-trips] Device ${deviceId}: found ${trips.length} trips from ${positions.length} points`);

        // Insert trips, checking for duplicates
        for (const trip of trips) {
          // Check if trip already exists (same device, same start time within 1 minute)
          const tripStartTime = new Date(trip.start_time);
          const startWindowMin = new Date(tripStartTime.getTime() - 60000).toISOString();
          const startWindowMax = new Date(tripStartTime.getTime() + 60000).toISOString();

          const { data: existing } = await supabase
            .from("vehicle_trips")
            .select("id")
            .eq("device_id", trip.device_id)
            .gte("start_time", startWindowMin)
            .lte("start_time", startWindowMax)
            .limit(1);

          if (existing && existing.length > 0) {
            totalTripsSkipped++;
            continue;
          }

          // Insert new trip
          const { error: insertError } = await supabase.from("vehicle_trips").insert(trip);

          if (insertError) {
            errors.push(`Device ${deviceId} trip insert: ${insertError.message}`);
          } else {
            totalTripsCreated++;
          }
        }
      } catch (err) {
        errors.push(`Device ${deviceId}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    const duration = Date.now() - startTime;
    const result = {
      success: true,
      devices_processed: uniqueDevices.length,
      trips_created: totalTripsCreated,
      trips_skipped: totalTripsSkipped,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: duration,
      lookback_hours: lookbackHours,
    };

    console.log(`[process-trips] Completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[process-trips] Fatal error: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
