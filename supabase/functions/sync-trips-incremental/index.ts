import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Rate limiting: Max 10 GPS51 API calls per second to avoid spikes
const GPS51_API_DELAY_MS = 100; // 100ms = 10 calls/second max
let lastApiCallTime = 0;

// Helper to rate-limit GPS51 API calls
async function rateLimitedDelay() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTime;
  if (timeSinceLastCall < GPS51_API_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, GPS51_API_DELAY_MS - timeSinceLastCall));
  }
  lastApiCallTime = Date.now();
}

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
}

interface SyncStatus {
  device_id: string;
  last_position_processed: string | null;
  sync_status: string;
}

interface Gps51Trip {
  starttime?: number;
  endtime?: number;
  starttime_str?: string;
  endtime_str?: string;
  distance?: number;
  maxspeed?: number;
  avgspeed?: number;
  startlat?: number;
  startlon?: number;
  endlat?: number;
  endlon?: number;
  [key: string]: any;
}

// Get valid GPS51 token and serverid
async function getValidToken(supabase: any): Promise<{ token: string; username: string; serverid: string }> {
  const { data: tokenData, error } = await supabase
    .from('app_settings')
    .select('value, expires_at, metadata')
    .eq('key', 'gps_token')
    .maybeSingle();

  if (error) throw new Error(`Token fetch error: ${error.message}`);
  if (!tokenData?.value) throw new Error('No GPS token found. Admin login required.');

  if (tokenData.expires_at) {
    const expiresAt = new Date(tokenData.expires_at);
    if (new Date() >= expiresAt) {
      throw new Error('Token expired. Admin refresh required.');
    }
  }

  return {
    token: tokenData.value,
    username: tokenData.metadata?.username || '',
    serverid: tokenData.metadata?.serverid || '1'
  };
}

// Call GPS51 API via proxy with rate limiting
async function callGps51(proxyUrl: string, action: string, token: string, serverid: string, body: any): Promise<any> {
  await rateLimitedDelay(); // Rate limit to avoid spikes
  
  const targetUrl = `https://api.gps51.com/openapi?action=${action}&token=${token}&serverid=${serverid}`;
  
  console.log(`[GPS51 API] Calling ${action} with serverid=${serverid}`);
  
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method: 'POST',
      data: body
    })
  });

  if (!response.ok) {
    throw new Error(`GPS51 API HTTP error: ${response.status}`);
  }

  const result = await response.json();
  return result;
}

// Format date for GPS51 API (yyyy-MM-dd HH:mm:ss)
function formatDateForGps51(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Fetch trips from GPS51 querytrips API
async function fetchTripsFromGps51(
  proxyUrl: string,
  token: string,
  serverid: string,
  deviceId: string,
  startDate: Date,
  endDate: Date
): Promise<TripData[]> {
  console.log(`[fetchTripsFromGps51] Fetching trips for ${deviceId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  const begintime = formatDateForGps51(startDate);
  const endtime = formatDateForGps51(endDate);
  
  const result = await callGps51(proxyUrl, 'querytrips', token, serverid, {
    deviceid: deviceId,
    begintime,
    endtime,
    timezone: 8 // GMT+8 (China time zone, default)
  });

  if (result.status !== 0) {
    throw new Error(`GPS51 querytrips error: ${result.cause || 'Unknown error'} (status: ${result.status})`);
  }

  const trips = result.totaltrips || [];
  console.log(`[fetchTripsFromGps51] Received ${trips.length} trips from GPS51`);

  // Map GPS51 trip format to our TripData format
  return trips.map((trip: Gps51Trip): TripData => {
    // GPS51 provides times as either timestamps (ms) or strings
    let startTime: string;
    let endTime: string;

    if (trip.starttime) {
      startTime = new Date(trip.starttime).toISOString();
    } else if (trip.starttime_str) {
      // Parse yyyy-MM-dd HH:mm:ss format
      startTime = new Date(trip.starttime_str.replace(' ', 'T') + '+08:00').toISOString();
    } else {
      throw new Error('Trip missing start time');
    }

    if (trip.endtime) {
      endTime = new Date(trip.endtime).toISOString();
    } else if (trip.endtime_str) {
      endTime = new Date(trip.endtime_str.replace(' ', 'T') + '+08:00').toISOString();
    } else {
      throw new Error('Trip missing end time');
    }

    // Distance is in meters, convert to km
    const distanceKm = trip.distance ? trip.distance / 1000 : 0;
    
    // Speed is in m/h, convert to km/h
    const maxSpeedKmh = trip.maxspeed ? trip.maxspeed / 1000 : null;
    const avgSpeedKmh = trip.avgspeed ? trip.avgspeed / 1000 : null;

    const startDateObj = new Date(startTime);
    const endDateObj = new Date(endTime);
    const durationSeconds = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / 1000);

    return {
      device_id: deviceId,
      start_time: startTime,
      end_time: endTime,
      start_latitude: trip.startlat || 0,
      start_longitude: trip.startlon || 0,
      end_latitude: trip.endlat || 0,
      end_longitude: trip.endlon || 0,
      distance_km: Math.round(distanceKm * 100) / 100,
      max_speed: maxSpeedKmh ? Math.round(maxSpeedKmh * 10) / 10 : null,
      avg_speed: avgSpeedKmh ? Math.round(avgSpeedKmh * 10) / 10 : null,
      duration_seconds: durationSeconds,
    };
  });
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

// Extract trips from position history
// Uses ignition-based detection (like GPS51) with speed-based fallback
function extractTripsFromHistory(positions: PositionPoint[]): TripData[] {
  if (positions.length < 2) return [];

  const trips: TripData[] = [];
  let currentTrip: { points: PositionPoint[] } | null = null;
  const SPEED_THRESHOLD = 1; // km/h - lowered to catch slow starts
  const MIN_TRIP_DISTANCE = 0.1; // km - lowered to catch short trips (GPS51 shows 0.56km trips)
  const STOP_DURATION_MS = 5 * 60 * 1000; // 5 minutes of no movement = trip end (increased)
  const MAX_TIME_GAP_MS = 30 * 60 * 1000; // 30 minutes - if gap is larger, end trip

  // Check if we have USABLE ignition data (at least some true values)
  // If all ignition values are false, we can't use ignition-based detection
  const hasIgnitionTrue = positions.some(p => p.ignitionOn === true);
  const hasIgnitionData = positions.some(p => p.ignitionOn !== null && p.ignitionOn !== undefined);
  const useIgnitionDetection = hasIgnitionData && hasIgnitionTrue; // Only use if we have actual true values

  console.log(`[extractTripsFromHistory] Using ${useIgnitionDetection ? 'ignition-based' : 'speed-based'} detection for ${positions.length} points`);

  for (let i = 0; i < positions.length; i++) {
    const point = positions[i];
    const prevPoint = i > 0 ? positions[i - 1] : null;

    // Normalize speed
    const normalizedSpeed = point.speed !== null && point.speed > 0
      ? (point.speed > 1000 ? point.speed / 1000 : point.speed)
      : 0;
    const prevNormalizedSpeed = prevPoint && prevPoint.speed !== null && prevPoint.speed > 0
      ? (prevPoint.speed > 1000 ? prevPoint.speed / 1000 : prevPoint.speed)
      : 0;

    const isMoving = normalizedSpeed > SPEED_THRESHOLD;
    const wasMoving = prevPoint && prevNormalizedSpeed > SPEED_THRESHOLD;

    // Check time gap between points
    const timeGap = prevPoint
      ? new Date(point.gps_time).getTime() - new Date(prevPoint.gps_time).getTime()
      : 0;

    // IGNITION-BASED DETECTION (Primary - matches GPS51)
    if (useIgnitionDetection) {
      const ignitionOn = point.ignitionOn === true;
      const prevIgnitionOn = prevPoint ? prevPoint.ignitionOn === true : false;

      // Trip START: Ignition turns ON (false -> true)
      if (ignitionOn && !prevIgnitionOn && !currentTrip) {
        currentTrip = { points: [point] };
        console.log(`[extractTripsFromHistory] Trip START (ignition ON) at ${point.gps_time}`);
      }

      // Continue trip while ignition is ON
      if (currentTrip && ignitionOn) {
        currentTrip.points.push(point);
      }

      // Trip END: Ignition turns OFF (true -> false) OR large time gap
      const shouldEndTrip =
        currentTrip &&
        ((prevIgnitionOn && !ignitionOn) ||
          (timeGap > MAX_TIME_GAP_MS) ||
          (timeGap > STOP_DURATION_MS && !ignitionOn) ||
          i === positions.length - 1);

      if (shouldEndTrip && currentTrip && currentTrip.points.length >= 2) {
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

          const speed = p2.speed !== null && p2.speed > 0
            ? (p2.speed > 1000 ? p2.speed / 1000 : p2.speed)
            : 0;

          if (speed > 0 && speed < 200) {
            maxSpeed = Math.max(maxSpeed, speed);
            totalSpeed += speed;
            speedCount++;
          }
        }

        // Record trip if it meets minimum distance (lowered threshold)
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
          });
          console.log(`[extractTripsFromHistory] Trip recorded: ${startPoint.gps_time} to ${endPoint.gps_time}, distance: ${Math.round(totalDistance * 100) / 100}km`);
        } else {
          console.log(`[extractTripsFromHistory] Trip filtered (distance too short: ${Math.round(totalDistance * 100) / 100}km < ${MIN_TRIP_DISTANCE}km)`);
        }

        currentTrip = null;
      }
    } else {
      // IMPROVED SPEED-BASED DETECTION (When no ignition data)
      // Uses distance-based movement detection to catch all trips
      const DISTANCE_THRESHOLD = 0.05; // 50 meters - significant movement
      const MIN_MOVEMENT_SPEED = 0.5; // km/h - very low threshold
      
      // Calculate distance from previous point
      let distanceFromPrev = 0;
      if (prevPoint) {
        distanceFromPrev = calculateDistance(
          prevPoint.latitude, prevPoint.longitude,
          point.latitude, point.longitude
        );
      }

      // Detect movement: either speed > threshold OR significant distance change
      const hasMovement = normalizedSpeed > MIN_MOVEMENT_SPEED || distanceFromPrev > DISTANCE_THRESHOLD;
      const hadMovement = prevPoint && (
        prevNormalizedSpeed > MIN_MOVEMENT_SPEED || 
        (i > 1 && calculateDistance(
          positions[i-2].latitude, positions[i-2].longitude,
          prevPoint.latitude, prevPoint.longitude
        ) > DISTANCE_THRESHOLD)
      );

      // Start new trip when movement begins
      if (hasMovement && !currentTrip) {
        currentTrip = { points: [point] };
        console.log(`[extractTripsFromHistory] Trip START (movement detected) at ${point.gps_time}, speed: ${normalizedSpeed.toFixed(2)} km/h, dist: ${distanceFromPrev.toFixed(3)} km`);
      }

      // Continue trip while there's any movement or we're still in motion
      if (currentTrip && (hasMovement || normalizedSpeed > 0 || distanceFromPrev > 0.01)) {
        currentTrip.points.push(point);
      }

      // End trip conditions:
      // 1. Was moving, now stopped for > STOP_DURATION
      // 2. Large time gap (> MAX_TIME_GAP)
      // 3. Last point in data
      const isStopped = !hasMovement && normalizedSpeed <= 0.1 && distanceFromPrev < 0.01;
      const wasStopped = prevPoint && !hadMovement && prevNormalizedSpeed <= 0.1;
      
      const shouldEndTrip =
        currentTrip &&
        ((hadMovement && isStopped && timeGap > STOP_DURATION_MS) ||
          (timeGap > MAX_TIME_GAP_MS) ||
          (i === positions.length - 1));

      if (shouldEndTrip && currentTrip && currentTrip.points.length >= 2) {
        const tripPoints = currentTrip.points;
        const startPoint = tripPoints[0];
        const endPoint = tripPoints[tripPoints.length - 1];

        // Calculate total distance traveled
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

          const speed = p2.speed !== null && p2.speed > 0
            ? (p2.speed > 1000 ? p2.speed / 1000 : p2.speed)
            : 0;

          if (speed > 0 && speed < 200) {
            maxSpeed = Math.max(maxSpeed, speed);
            totalSpeed += speed;
            speedCount++;
          }
        }

        // Record trip if it meets minimum distance
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
          });
          console.log(`[extractTripsFromHistory] Trip recorded: ${startPoint.gps_time} to ${endPoint.gps_time}, distance: ${Math.round(totalDistance * 100) / 100}km, duration: ${durationSeconds}s`);
        } else {
          console.log(`[extractTripsFromHistory] Trip filtered (distance too short: ${Math.round(totalDistance * 100) / 100}km < ${MIN_TRIP_DISTANCE}km)`);
        }

        currentTrip = null;
      }

      // Reset trip if we weren't moving and haven't started one
      if (!hasMovement && !hadMovement && currentTrip && currentTrip.points.length === 1) {
        // Only reset if trip just started and immediately stopped
        const singlePointTime = new Date(currentTrip.points[0].gps_time).getTime();
        const currentTime = new Date(point.gps_time).getTime();
        if (currentTime - singlePointTime > STOP_DURATION_MS) {
          currentTrip = null;
        }
      }
    }
  }

  console.log(`[extractTripsFromHistory] Extracted ${trips.length} trips from ${positions.length} positions`);
  return trips;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  const startTime = Date.now();
  console.log("[sync-trips-incremental] Starting incremental trip sync");

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    
    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for optional parameters
    let deviceIds: string[] | null = null;
    let forceFullSync = false;

    try {
      const body = await req.json();
      if (body.device_ids && Array.isArray(body.device_ids)) {
        deviceIds = body.device_ids;
      }
      if (body.force_full_sync === true) {
        forceFullSync = true;
      }
    } catch {
      // No body or invalid JSON, process all devices
    }

    // Get GPS51 credentials and proxy URL
    const DO_PROXY_URL = Deno.env.get("DO_PROXY_URL");
    if (!DO_PROXY_URL) {
      throw new Error("Missing DO_PROXY_URL environment variable");
    }

    const { token, username, serverid } = await getValidToken(supabase);
    console.log(`[sync-trips-incremental] Using GPS51 token for user: ${username}, serverid: ${serverid}`);

    // Get devices to sync
    let uniqueDevices: string[] = [];
    
    if (deviceIds && deviceIds.length > 0) {
      uniqueDevices = deviceIds;
    } else {
      // Get all devices from vehicles table
      const { data: vehicles, error: vehiclesError } = await supabase
        .from("vehicles")
        .select("device_id");
      
      if (vehiclesError) {
        throw new Error(`Failed to get devices: ${vehiclesError.message}`);
      }
      
      uniqueDevices = [...new Set(vehicles?.map((v) => v.device_id).filter(Boolean))] as string[];
    }

    console.log(`[sync-trips-incremental] Processing ${uniqueDevices.length} devices using GPS51 querytrips API`);

    let totalTripsCreated = 0;
    let totalTripsSkipped = 0;
    const errors: string[] = [];
    const deviceResults: Record<string, any> = {};

    // Process each device with rate limiting to avoid spikes
    for (let i = 0; i < uniqueDevices.length; i++) {
      const deviceId = uniqueDevices[i];
      
      // Add delay between devices to avoid API spikes (except first device)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, GPS51_API_DELAY_MS));
      }

      try {
        console.log(`[sync-trips-incremental] Processing device ${i + 1}/${uniqueDevices.length}: ${deviceId}`);

        // Get or create sync status
        const { data: syncStatus } = await supabase
          .from("trip_sync_status")
          .select("*")
          .eq("device_id", deviceId)
          .maybeSingle();

        // Determine date range
        let startDate: Date;
        let endDate: Date = new Date(); // End at now

        if (!syncStatus || forceFullSync) {
          // First sync or force full sync: look back 7 days
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          console.log(`[sync-trips-incremental] Full sync for ${deviceId}, processing last 7 days`);

          // Initialize sync status
          await supabase
            .from("trip_sync_status")
            .upsert({
              device_id: deviceId,
              sync_status: "processing",
              last_position_processed: startDate.toISOString(),
            });
        } else {
          // Incremental sync: process from last sync time or last 24 hours
          const lastProcessed = syncStatus.last_position_processed 
            ? new Date(syncStatus.last_position_processed)
            : new Date(Date.now() - 24 * 60 * 60 * 1000);
          startDate = lastProcessed;
          console.log(`[sync-trips-incremental] Incremental sync for ${deviceId} from ${startDate.toISOString()}`);

          // Update status to processing
          await supabase
            .from("trip_sync_status")
            .update({ sync_status: "processing" })
            .eq("device_id", deviceId);
        }

        // Fetch trips from GPS51 API
        const trips = await fetchTripsFromGps51(
          DO_PROXY_URL,
          token,
          serverid,
          deviceId,
          startDate,
          endDate
        );

        console.log(`[sync-trips-incremental] Device ${deviceId}: received ${trips.length} trips from GPS51`);

        let deviceTripsCreated = 0;
        let deviceTripsSkipped = 0;

        // Insert trips, checking for duplicates (batch process to avoid DB spikes)
        const BATCH_SIZE = 5; // Process 5 trips at a time
        for (let j = 0; j < trips.length; j += BATCH_SIZE) {
          const batch = trips.slice(j, j + BATCH_SIZE);
          
          // Small delay between batches to avoid DB spikes
          if (j > 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          for (const trip of batch) {
            const tripStartTime = new Date(trip.start_time);
            // Check for existing trip within 2 minutes window (GPS51 trips are precise)
            const startWindowMin = new Date(tripStartTime.getTime() - 2 * 60 * 1000).toISOString();
            const startWindowMax = new Date(tripStartTime.getTime() + 2 * 60 * 1000).toISOString();

            // Check for existing trip with similar start time AND similar distance
            const { data: existing } = await supabase
              .from("vehicle_trips")
              .select("id, distance_km")
              .eq("device_id", trip.device_id)
              .gte("start_time", startWindowMin)
              .lte("start_time", startWindowMax)
              .gte("distance_km", trip.distance_km * 0.95) // Tighter match (5% tolerance)
              .lte("distance_km", trip.distance_km * 1.05)
              .limit(1);

            if (existing && existing.length > 0) {
              console.log(`[sync-trips-incremental] Skipping duplicate trip: ${trip.start_time} (existing: ${existing[0].id})`);
              deviceTripsSkipped++;
              totalTripsSkipped++;
              continue;
            }

            // Insert new trip
            const { error: insertError } = await supabase.from("vehicle_trips").insert(trip);

            if (insertError) {
              console.error(`[sync-trips-incremental] Error inserting trip: ${insertError.message}`);
              errors.push(`Device ${deviceId} trip insert: ${insertError.message}`);
            } else {
              console.log(`[sync-trips-incremental] Inserted trip: ${trip.start_time} to ${trip.end_time}, ${trip.distance_km}km`);
              deviceTripsCreated++;
              totalTripsCreated++;
            }
          }
        }

        // Update sync status
        const latestTripTime = trips.length > 0 
          ? trips[trips.length - 1].end_time 
          : endDate.toISOString();

        await supabase
          .from("trip_sync_status")
          .update({
            sync_status: "completed",
            last_sync_at: new Date().toISOString(),
            last_position_processed: latestTripTime,
            trips_processed: deviceTripsCreated,
            error_message: null,
          })
          .eq("device_id", deviceId);

        deviceResults[deviceId] = {
          trips: deviceTripsCreated,
          skipped: deviceTripsSkipped,
          total_from_gps51: trips.length,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[sync-trips-incremental] Error processing device ${deviceId}:`, errorMsg);
        errors.push(`Device ${deviceId}: ${errorMsg}`);

        await supabase
          .from("trip_sync_status")
          .update({
            sync_status: "error",
            error_message: errorMsg,
          })
          .eq("device_id", deviceId);
      }
    }

    const duration = Date.now() - startTime;
    const result = {
      success: true,
      devices_processed: uniqueDevices.length,
      trips_created: totalTripsCreated,
      trips_skipped: totalTripsSkipped,
      device_results: deviceResults,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: duration,
      sync_type: forceFullSync ? "full" : "incremental",
    };

    console.log(`[sync-trips-incremental] Completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[sync-trips-incremental] Fatal error: ${errorMessage}`);

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
