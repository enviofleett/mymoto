import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeSpeed } from "../_shared/telemetry-normalizer.ts";
import { getFeatureFlag } from "../_shared/feature-flags.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// ============================================================================
// INLINED GPS51 CLIENT WITH RATE LIMITING (for Dashboard deployment)
// ============================================================================

// Rate limiting configuration
const GPS51_RATE_LIMIT = {
  // VERY Conservative limits to prevent IP blocking (8902 errors)
  MAX_CALLS_PER_SECOND: 3, // Reduced from 5 to 3 for extra safety
  MIN_DELAY_MS: 350, // 350ms = ~2.8 calls/second max (safer than 5/sec)
  BURST_WINDOW_MS: 1000, // 1 second window
  MAX_BURST_CALLS: 3, // Max 3 calls in 1 second (reduced from 5)
  
  // Retry configuration
  MAX_RETRIES: 2, // Reduced from 3 to 2 to fail faster and avoid more calls
  INITIAL_RETRY_DELAY_MS: 2000, // Increased from 1s to 2s
  MAX_RETRY_DELAY_MS: 60000, // Increased from 30s to 60s (1 minute)
  BACKOFF_MULTIPLIER: 3, // Increased from 2 to 3 for faster backoff
  
  // Rate limit error codes from GPS51
  RATE_LIMIT_ERROR_CODES: [8902, 9903, 9904], // IP limit, token expired, parameter error
  
  // Extended backoff period after rate limit error (in milliseconds)
  RATE_LIMIT_BACKOFF_MS: 60000, // 60 seconds (1 minute) - increased from default
};

interface RateLimitState {
  last_call_time: number;
  calls_in_window: number;
  window_start: number;
  backoff_until: number;
}

// In-memory cache for rate limit state (per function instance)
let localRateLimitState: RateLimitState = {
  last_call_time: 0,
  calls_in_window: 0,
  window_start: Date.now(),
  backoff_until: 0,
};

/**
 * Get or create rate limit state in database (coordinates across instances)
 */
async function getGlobalRateLimitState(
  supabase: any
): Promise<{ backoff_until: number; last_call_time: number }> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value, metadata")
      .eq("key", "gps51_rate_limit_state")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found, which is OK
      console.warn(`[GPS51 Client] Error fetching rate limit state: ${error.message}`);
    }

    if (data?.value) {
      const state = JSON.parse(data.value);
      return {
        backoff_until: state.backoff_until || 0,
        last_call_time: state.last_call_time || 0,
      };
    }

    return { backoff_until: 0, last_call_time: 0 };
  } catch (error) {
    console.warn(`[GPS51 Client] Error parsing rate limit state: ${error}`);
    return { backoff_until: 0, last_call_time: 0 };
  }
}

/**
 * Update global rate limit state in database
 */
async function updateGlobalRateLimitState(
  supabase: any,
  backoffUntil: number,
  lastCallTime: number
): Promise<void> {
  try {
    await supabase.from("app_settings").upsert({
      key: "gps51_rate_limit_state",
      value: JSON.stringify({
        backoff_until: backoffUntil,
        last_call_time: lastCallTime,
        updated_at: new Date().toISOString(),
      }),
      metadata: {
        updated_by: "gps51-client",
      },
    });
  } catch (error) {
    console.warn(`[GPS51 Client] Error updating rate limit state: ${error}`);
  }
}

/**
 * Check if we're in a backoff period (from rate limit error)
 */
async function checkBackoff(supabase: any): Promise<number> {
  const globalState = await getGlobalRateLimitState(supabase);
  const now = Date.now();
  
  // Check global backoff
  if (globalState.backoff_until > now) {
    const remaining = globalState.backoff_until - now;
    console.log(`[GPS51 Client] In backoff period, waiting ${remaining}ms`);
    return remaining;
  }
  
  // Check local backoff
  if (localRateLimitState.backoff_until > now) {
    const remaining = localRateLimitState.backoff_until - now;
    console.log(`[GPS51 Client] In local backoff period, waiting ${remaining}ms`);
    return remaining;
  }
  
  return 0;
}

/**
 * Apply rate limiting delay
 */
async function applyRateLimit(supabase: any): Promise<void> {
  const now = Date.now();
  
  // Check backoff first
  const backoffMs = await checkBackoff(supabase);
  if (backoffMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return;
  }
  
  // Reset window if expired
  if (now - localRateLimitState.window_start >= GPS51_RATE_LIMIT.BURST_WINDOW_MS) {
    localRateLimitState.window_start = now;
    localRateLimitState.calls_in_window = 0;
  }
  
  // Check if we've exceeded burst limit
  if (localRateLimitState.calls_in_window >= GPS51_RATE_LIMIT.MAX_BURST_CALLS) {
    const waitTime = GPS51_RATE_LIMIT.BURST_WINDOW_MS - (now - localRateLimitState.window_start);
    if (waitTime > 0) {
      console.log(`[GPS51 Client] Burst limit reached, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      localRateLimitState.window_start = Date.now();
      localRateLimitState.calls_in_window = 0;
    }
  }
  
  // Apply minimum delay between calls
  const timeSinceLastCall = now - localRateLimitState.last_call_time;
  if (timeSinceLastCall < GPS51_RATE_LIMIT.MIN_DELAY_MS) {
    const delay = GPS51_RATE_LIMIT.MIN_DELAY_MS - timeSinceLastCall;
    console.log(`[GPS51 Client] Rate limiting: waiting ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  
  // Update state
  localRateLimitState.last_call_time = Date.now();
  localRateLimitState.calls_in_window++;
  
  // Update global state (async, don't wait)
  updateGlobalRateLimitState(supabase, 0, localRateLimitState.last_call_time).catch(
    (err) => console.warn(`[GPS51 Client] Failed to update global state: ${err}`)
  );
}

/**
 * Handle rate limit error with exponential backoff
 */
async function handleRateLimitError(
  supabase: any,
  attempt: number,
  errorCode: number
): Promise<number> {
  if (!GPS51_RATE_LIMIT.RATE_LIMIT_ERROR_CODES.includes(errorCode)) {
    return 0; // Not a rate limit error
  }
  
  // For IP limit errors (8902), use extended backoff period
  const isIpLimitError = errorCode === 8902;
  const baseBackoffDelay = isIpLimitError 
    ? GPS51_RATE_LIMIT.RATE_LIMIT_BACKOFF_MS // Use extended backoff for IP limit
    : GPS51_RATE_LIMIT.INITIAL_RETRY_DELAY_MS * Math.pow(GPS51_RATE_LIMIT.BACKOFF_MULTIPLIER, attempt);
  
  // Calculate backoff delay with exponential backoff
  const backoffDelay = Math.min(
    baseBackoffDelay,
    GPS51_RATE_LIMIT.MAX_RETRY_DELAY_MS
  );
  
  const backoffUntil = Date.now() + backoffDelay;
  
  // Set local backoff
  localRateLimitState.backoff_until = backoffUntil;
  
  // Set global backoff (coordinates across all function instances)
  await updateGlobalRateLimitState(supabase, backoffUntil, Date.now());
  
  console.warn(
    `[GPS51 Client] Rate limit error ${errorCode} (IP limit: ${isIpLimitError}), backing off for ${Math.round(backoffDelay / 1000)}s (attempt ${attempt + 1})`
  );
  
  return backoffDelay;
}

/**
 * Call GPS51 API with centralized rate limiting and retry logic
 */
async function callGps51WithRateLimit(
  supabase: any,
  proxyUrl: string,
  action: string,
  token: string,
  serverid: string,
  body: any,
  retryAttempt: number = 0
): Promise<any> {
  // Apply rate limiting
  await applyRateLimit(supabase);
  
  const targetUrl = `https://api.gps51.com/openapi?action=${action}&token=${token}&serverid=${serverid}`;
  
  console.log(`[GPS51 Client] Calling ${action} (attempt ${retryAttempt + 1})`);
  
  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl,
        method: "POST",
        data: body,
      }),
    });

    if (!response.ok) {
      throw new Error(`GPS51 API HTTP error: ${response.status}`);
    }

    const result = await response.json();
    
    // Check for rate limit errors
    if (result.status && GPS51_RATE_LIMIT.RATE_LIMIT_ERROR_CODES.includes(result.status)) {
      // Handle rate limit error
      if (retryAttempt < GPS51_RATE_LIMIT.MAX_RETRIES) {
        const backoffDelay = await handleRateLimitError(supabase, retryAttempt, result.status);
        
        // Wait for backoff period
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        
        // Retry with exponential backoff
        console.log(`[GPS51 Client] Retrying ${action} after backoff`);
        return callGps51WithRateLimit(supabase, proxyUrl, action, token, serverid, body, retryAttempt + 1);
      } else {
        throw new Error(
          `GPS51 API rate limit error after ${GPS51_RATE_LIMIT.MAX_RETRIES} retries: ${result.cause || "Unknown"} (status: ${result.status})`
        );
      }
    }
    
    // Success - reset backoff
    localRateLimitState.backoff_until = 0;
    await updateGlobalRateLimitState(supabase, 0, Date.now());
    
    return result;
  } catch (error) {
    // For network errors, retry with backoff
    if (retryAttempt < GPS51_RATE_LIMIT.MAX_RETRIES && error instanceof Error) {
      const backoffDelay =
        GPS51_RATE_LIMIT.INITIAL_RETRY_DELAY_MS *
        Math.pow(GPS51_RATE_LIMIT.BACKOFF_MULTIPLIER, retryAttempt);
      
      console.warn(`[GPS51 Client] Network error, retrying in ${backoffDelay}ms: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      
      return callGps51WithRateLimit(supabase, proxyUrl, action, token, serverid, body, retryAttempt + 1);
    }
    
    throw error;
  }
}

/**
 * Get valid GPS51 token (shared utility)
 */
async function getValidGps51Token(supabase: any): Promise<{
  token: string;
  username: string;
  serverid: string;
}> {
  const { data: tokenData, error } = await supabase
    .from("app_settings")
    .select("value, expires_at, metadata")
    .eq("key", "gps_token")
    .maybeSingle();

  if (error) throw new Error(`Token fetch error: ${error.message}`);
  if (!tokenData?.value) throw new Error("No GPS token found. Admin login required.");

  if (tokenData.expires_at) {
    const expiresAt = new Date(tokenData.expires_at);
    if (new Date() >= expiresAt) {
      throw new Error("Token expired. Admin refresh required.");
    }
  }

  return {
    token: tokenData.value,
    username: tokenData.metadata?.username || "",
    serverid: tokenData.metadata?.serverid || "1",
  };
}

// ============================================================================
// END OF INLINED GPS51 CLIENT
// ============================================================================

interface PositionPoint {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  gps_time: string;
  ignition_on: boolean | null;
  ignition_confidence?: number | null;
  ignition_detection_method?: string | null;
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
  supabase: any,
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
  
  const result = await callGps51WithRateLimit(
    supabase,
    proxyUrl,
    'querytrips',
    token,
    serverid,
    {
      deviceid: deviceId,
      begintime,
      endtime,
      timezone: 8 // GMT+8 (China time zone, default)
    }
  );

  if (result.status !== 0) {
    throw new Error(`GPS51 querytrips error: ${result.cause || 'Unknown error'} (status: ${result.status})`);
  }

  const trips = result.totaltrips || [];
  console.log(`[fetchTripsFromGps51] Received ${trips.length} trips from GPS51`);

  // Map GPS51 trip format to our TripData format
  // CRITICAL FIX: Don't filter out trips with missing coordinates - we'll backfill them from position_history
  return trips
    .filter((trip: Gps51Trip) => {
      // Only require start and end times - coordinates can be missing and will be backfilled
      const hasStartTime = trip.starttime || trip.starttime_str;
      const hasEndTime = trip.endtime || trip.endtime_str;
      
      if (!hasStartTime || !hasEndTime) {
        console.log(`[fetchTripsFromGps51] Filtering out trip with missing times:`, {
          hasStartTime, hasEndTime
        });
        return false;
      }
      
      // Log trips with missing coordinates but don't filter them out
      const hasStartCoords = trip.startlat && trip.startlon && trip.startlat !== 0 && trip.startlon !== 0;
      const hasEndCoords = trip.endlat && trip.endlon && trip.endlat !== 0 && trip.endlon !== 0;
      if (!hasStartCoords || !hasEndCoords) {
        console.log(`[fetchTripsFromGps51] Trip with missing coordinates (will backfill):`, {
          startlat: trip.startlat, startlon: trip.startlon,
          endlat: trip.endlat, endlon: trip.endlon
        });
      }
      return true;
    })
    .map((trip: Gps51Trip): TripData => {
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

      // CRITICAL FIX: Use GPS51 distance as source of truth (not recalculated)
      // GPS51 accumulates distance along actual GPS path, which is more accurate than straight-line
      // According to API docs, distance/totaldistance is in meters
      let distanceKm = 0;
      if (trip.distance) {
        // Primary: Use GPS51's distance field (accumulated along path)
        distanceKm = trip.distance / 1000;
        console.log(`[fetchTripsFromGps51] Using GPS51 distance: ${distanceKm.toFixed(2)}km`);
      } else if ((trip as any).totaldistance) {
        // Secondary: Some API versions use totaldistance field
        distanceKm = (trip as any).totaldistance / 1000;
        console.log(`[fetchTripsFromGps51] Using GPS51 totaldistance: ${distanceKm.toFixed(2)}km`);
      } else if (trip.startlat && trip.startlon && trip.endlat && trip.endlon) {
        // Fallback only: Calculate straight-line distance if GPS51 doesn't provide distance
        // This is less accurate (30-50% less than actual path) but better than 0
        distanceKm = calculateDistance(
          trip.startlat,
          trip.startlon,
          trip.endlat,
          trip.endlon
        );
        console.warn(`[fetchTripsFromGps51] GPS51 didn't provide distance, calculated fallback: ${distanceKm.toFixed(2)}km (may be 30-50% less than actual)`);
      }
    
      // Speed is in m/h, normalize using centralized normalizer
      const maxSpeedKmh = trip.maxspeed ? normalizeSpeed(trip.maxspeed) : null;
      const avgSpeedKmh = trip.avgspeed ? normalizeSpeed(trip.avgspeed) : null;

      const startDateObj = new Date(startTime);
      const endDateObj = new Date(endTime);
      const durationSeconds = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / 1000);

      // CRITICAL FIX: Handle missing coordinates from GPS51
      // If GPS51 doesn't provide coordinates, they'll be undefined/null, which becomes 0 in DB
      // We'll use 0 as a marker that coordinates need to be backfilled from position_history
      const startLat = trip.startlat && trip.startlat !== 0 ? trip.startlat : 0;
      const startLon = trip.startlon && trip.startlon !== 0 ? trip.startlon : 0;
      const endLat = trip.endlat && trip.endlat !== 0 ? trip.endlat : 0;
      const endLon = trip.endlon && trip.endlon !== 0 ? trip.endlon : 0;

      return {
        device_id: deviceId,
        start_time: startTime,
        end_time: endTime,
        start_latitude: startLat,
        start_longitude: startLon,
        end_latitude: endLat,
        end_longitude: endLon,
        distance_km: Math.round(distanceKm * 100) / 100,
        max_speed: maxSpeedKmh ? Math.round(maxSpeedKmh * 10) / 10 : null,
        avg_speed: avgSpeedKmh ? Math.round(avgSpeedKmh * 10) / 10 : null,
        duration_seconds: durationSeconds,
      };
    })
    .filter((trip: TripData) => {
      // Log trips with missing coordinates for debugging
      if (trip.start_latitude === 0 || trip.start_longitude === 0) {
        console.warn(`[fetchTripsFromGps51] Trip missing start coordinates: ${trip.start_time}`);
      }
      if (trip.end_latitude === 0 || trip.end_longitude === 0) {
        console.warn(`[fetchTripsFromGps51] Trip missing end coordinates: ${trip.end_time}`);
      }
      // Still include trips even if coordinates are missing - we'll backfill them
      return true;
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

  // Check if we have USABLE ignition data (at least some true values with sufficient confidence)
  // Confidence threshold: >= 0.5 (medium confidence) to ensure reliable trip detection
  const MIN_IGNITION_CONFIDENCE = 0.5;
  const hasIgnitionTrue = positions.some(p => {
    const hasConfidence = p.ignition_confidence !== null && p.ignition_confidence !== undefined;
    const confidenceOk = hasConfidence ? p.ignition_confidence! >= MIN_IGNITION_CONFIDENCE : false;
    return p.ignition_on === true && (confidenceOk || !hasConfidence); // Allow if no confidence data (backward compat)
  });
  const hasIgnitionData = positions.some(p => p.ignition_on !== null && p.ignition_on !== undefined);
  const useIgnitionDetection = hasIgnitionData && hasIgnitionTrue; // Only use if we have actual true values with sufficient confidence

  // Log low-confidence ignition states for review
  const lowConfidenceCount = positions.filter(p => 
    p.ignition_on === true && 
    p.ignition_confidence !== null && 
    p.ignition_confidence !== undefined && 
    p.ignition_confidence < MIN_IGNITION_CONFIDENCE
  ).length;
  if (lowConfidenceCount > 0) {
    console.warn(`[extractTripsFromHistory] Found ${lowConfidenceCount} positions with low ignition confidence (<${MIN_IGNITION_CONFIDENCE}), these will not trigger trip starts`);
  }

  console.log(`[extractTripsFromHistory] Using ${useIgnitionDetection ? 'ignition-based' : 'speed-based'} detection for ${positions.length} points`);

  for (let i = 0; i < positions.length; i++) {
    const point = positions[i];
    const prevPoint = i > 0 ? positions[i - 1] : null;

    // Normalize speed using centralized normalizer
    // Note: Speed in database may be in m/h or km/h, normalizer handles detection
    const normalizedSpeed = normalizeSpeed(point.speed);
    const prevNormalizedSpeed = prevPoint ? normalizeSpeed(prevPoint.speed) : 0;

    const isMoving = normalizedSpeed > SPEED_THRESHOLD;
    const wasMoving = prevPoint && prevNormalizedSpeed > SPEED_THRESHOLD;

    // Check time gap between points
    const timeGap = prevPoint
      ? new Date(point.gps_time).getTime() - new Date(prevPoint.gps_time).getTime()
      : 0;

    // IGNITION-BASED DETECTION (Primary - matches GPS51)
    if (useIgnitionDetection) {
      // Check ignition with confidence threshold (>= 0.5 for reliable detection)
      const hasConfidence = point.ignition_confidence !== null && point.ignition_confidence !== undefined;
      const confidenceOk = hasConfidence ? point.ignition_confidence! >= MIN_IGNITION_CONFIDENCE : true; // Allow if no confidence data (backward compat)
      const ignitionOn = point.ignition_on === true && confidenceOk;
      
      const prevHasConfidence = prevPoint ? (prevPoint.ignition_confidence !== null && prevPoint.ignition_confidence !== undefined) : false;
      const prevConfidenceOk = prevPoint && prevHasConfidence ? prevPoint.ignition_confidence! >= MIN_IGNITION_CONFIDENCE : true;
      const prevIgnitionOn = prevPoint ? (prevPoint.ignition_on === true && prevConfidenceOk) : false;

      // Trip START: Ignition turns ON (false -> true) with sufficient confidence
      if (ignitionOn && !prevIgnitionOn && !currentTrip) {
        const confidenceInfo = hasConfidence ? ` (confidence: ${point.ignition_confidence!.toFixed(2)}, method: ${point.ignition_detection_method || 'unknown'})` : '';
        currentTrip = { points: [point] };
        console.log(`[extractTripsFromHistory] Trip START (ignition ON) at ${point.gps_time}${confidenceInfo}`);
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

          // Normalize speed using centralized normalizer
          const speed = normalizeSpeed(p2.speed);

          if (speed > 0 && speed < 200) {
            maxSpeed = Math.max(maxSpeed, speed);
            totalSpeed += speed;
            speedCount++;
          }
        }

        // CRITICAL FIX: Filter trips with same start/end coordinates
        // Calculate distance between start and end points
        const startEndDistance = calculateDistance(
          startPoint.latitude,
          startPoint.longitude,
          endPoint.latitude,
          endPoint.longitude
        );

        // Minimum distance threshold for valid trip (100 meters)
        const MIN_START_END_DISTANCE = 0.1; // km

        // Also check if all points are within small radius (GPS drift detection)
        let maxPointDistance = 0;
        for (let k = 1; k < tripPoints.length; k++) {
          const dist = calculateDistance(
            tripPoints[0].latitude,
            tripPoints[0].longitude,
            tripPoints[k].latitude,
            tripPoints[k].longitude
          );
          maxPointDistance = Math.max(maxPointDistance, dist);
        }

        // Record trip only if:
        // 1. Total distance >= minimum (existing check)
        // 2. Start-to-end distance >= minimum (NEW - prevents same-location trips)
        // 3. Points are not all clustered in same location (NEW - prevents GPS drift)
        if (totalDistance >= MIN_TRIP_DISTANCE && 
            startEndDistance >= MIN_START_END_DISTANCE &&
            maxPointDistance >= MIN_START_END_DISTANCE) {
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
          console.log(`[extractTripsFromHistory] Trip filtered: distance=${Math.round(totalDistance * 100) / 100}km, start-end=${Math.round(startEndDistance * 100) / 100}km, max-point=${Math.round(maxPointDistance * 100) / 100}km`);
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

          // Normalize speed using centralized normalizer
          const speed = normalizeSpeed(p2.speed);

          if (speed > 0 && speed < 200) {
            maxSpeed = Math.max(maxSpeed, speed);
            totalSpeed += speed;
            speedCount++;
          }
        }

        // CRITICAL FIX: Filter trips with same start/end coordinates
        const startEndDistance = calculateDistance(
          startPoint.latitude,
          startPoint.longitude,
          endPoint.latitude,
          endPoint.longitude
        );

        const MIN_START_END_DISTANCE = 0.1; // km

        // Check if all points are within small radius (GPS drift detection)
        let maxPointDistance = 0;
        for (let k = 1; k < tripPoints.length; k++) {
          const dist = calculateDistance(
            tripPoints[0].latitude,
            tripPoints[0].longitude,
            tripPoints[k].latitude,
            tripPoints[k].longitude
          );
          maxPointDistance = Math.max(maxPointDistance, dist);
        }

        // Record trip only if all validation checks pass
        if (totalDistance >= MIN_TRIP_DISTANCE && 
            startEndDistance >= MIN_START_END_DISTANCE &&
            maxPointDistance >= MIN_START_END_DISTANCE) {
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
          console.log(`[extractTripsFromHistory] Trip filtered: distance=${Math.round(totalDistance * 100) / 100}km, start-end=${Math.round(startEndDistance * 100) / 100}km, max-point=${Math.round(maxPointDistance * 100) / 100}km`);
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
    const { enabled: verboseLogs } = await getFeatureFlag(supabase, "sync_logging_verbose");
    const vlog = (...args: any[]) => { if (verboseLogs) console.log(...args) };

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

    vlog("[sync-trips-incremental] params:", { deviceIdsCount: deviceIds?.length ?? null, forceFullSync });

    // Get GPS51 credentials and proxy URL
    const DO_PROXY_URL = Deno.env.get("DO_PROXY_URL");
    if (!DO_PROXY_URL) {
      throw new Error("Missing DO_PROXY_URL environment variable");
    }

    const { token, username, serverid } = await getValidGps51Token(supabase);
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

    // SAFETY: Process devices one at a time with delays to prevent rate limit spikes
    for (let i = 0; i < uniqueDevices.length; i++) {
      const deviceId = uniqueDevices[i];
      
      // Add delay between devices to prevent rate limit spikes
      if (i > 0) {
        const delayMs = 2000; // 2 second delay between devices (increased for safety)
        console.log(`[sync-trips-incremental] Waiting ${delayMs}ms before processing next device...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
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
          // FIX: Extended from 3 days to 30 days for comprehensive historical data
          // First sync or force full sync: look back 30 days
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          console.log(`[sync-trips-incremental] Full sync for ${deviceId}, processing last 30 days (extended from 3 for comprehensive history)`);

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

        // Fetch trips from GPS51 API (with centralized rate limiting)
        const trips = await fetchTripsFromGps51(
          supabase,
          DO_PROXY_URL,
          token,
          serverid,
          deviceId,
          startDate,
          endDate
        );

        console.log(`[sync-trips-incremental] Device ${deviceId}: received ${trips.length} trips from GPS51`);

        // Update progress: Set total trips to process
        // Include new progress fields - Supabase will ignore columns that don't exist
        const progressUpdate: any = {
          sync_status: "processing",
          trips_total: trips.length,
          sync_progress_percent: 0,
          current_operation: `Processing ${trips.length} trips from GPS51`,
        };
        
        const { error: updateError } = await supabase
          .from("trip_sync_status")
          .update(progressUpdate)
          .eq("device_id", deviceId);
        
        // If update fails due to missing columns, try without new fields (graceful degradation)
        if (updateError && updateError.message?.includes('column') && updateError.message?.includes('does not exist')) {
          console.warn('[sync-trips-incremental] Progress columns not available, updating without them');
          await supabase
            .from("trip_sync_status")
            .update({ sync_status: "processing" })
            .eq("device_id", deviceId);
        } else if (updateError) {
          console.warn('[sync-trips-incremental] Error updating progress:', updateError.message);
        }

        let deviceTripsCreated = 0;
        let deviceTripsSkipped = 0;

        // Insert trips, checking for duplicates (batch process to avoid DB spikes)
        const BATCH_SIZE = 5; // Process 5 trips at a time
        const PROGRESS_UPDATE_INTERVAL = 10; // Update progress every 10 trips
        
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

            // CRITICAL FIX: Validate trip coordinates before processing
            // Filter trips with same start/end coordinates (within 100m)
            if (trip.start_latitude && trip.start_longitude && 
                trip.end_latitude && trip.end_longitude) {
              const startEndDistance = calculateDistance(
                trip.start_latitude,
                trip.start_longitude,
                trip.end_latitude,
                trip.end_longitude
              );
              
              const MIN_START_END_DISTANCE = 0.1; // 100 meters
              
              if (startEndDistance < MIN_START_END_DISTANCE) {
                console.log(`[sync-trips-incremental] Skipping trip with same start/end coordinates: ${startEndDistance.toFixed(3)}km`);
                deviceTripsSkipped++;
                totalTripsSkipped++;
                continue;
              }
            }

            // CRITICAL FIX: Backfill missing coordinates from position_history before inserting
            let tripToInsert = { ...trip };
            if (trip.start_latitude === 0 || trip.start_longitude === 0 || 
                trip.end_latitude === 0 || trip.end_longitude === 0) {
              console.log(`[sync-trips-incremental] Backfilling coordinates for trip: ${trip.start_time}`);
              
              // FIX: Extended from ±5 minutes to ±15 minutes to catch more coordinates
              // Get first GPS point near start time (within 15 minutes)
              const startTimeMin = new Date(trip.start_time);
              startTimeMin.setMinutes(startTimeMin.getMinutes() - 15);
              const startTimeMax = new Date(trip.start_time);
              startTimeMax.setMinutes(startTimeMax.getMinutes() + 15);
              
              const { data: startPoint } = await supabase
                .from("position_history")
                .select("latitude, longitude")
                .eq("device_id", trip.device_id)
                .gte("gps_time", startTimeMin.toISOString())
                .lte("gps_time", startTimeMax.toISOString())
                .not("latitude", "is", null)
                .not("longitude", "is", null)
                .neq("latitude", 0)
                .neq("longitude", 0)
                .order("gps_time", { ascending: true })
                .limit(1)
                .maybeSingle();
              
              // FIX: Extended from ±5 minutes to ±15 minutes to catch more coordinates
              // Get last GPS point near end time (within 15 minutes)
              const endTimeMin = new Date(trip.end_time);
              endTimeMin.setMinutes(endTimeMin.getMinutes() - 15);
              const endTimeMax = new Date(trip.end_time);
              endTimeMax.setMinutes(endTimeMax.getMinutes() + 15);
              
              const { data: endPoint } = await supabase
                .from("position_history")
                .select("latitude, longitude")
                .eq("device_id", trip.device_id)
                .gte("gps_time", endTimeMin.toISOString())
                .lte("gps_time", endTimeMax.toISOString())
                .not("latitude", "is", null)
                .not("longitude", "is", null)
                .neq("latitude", 0)
                .neq("longitude", 0)
                .order("gps_time", { ascending: false })
                .limit(1)
                .maybeSingle();
              
              // Update coordinates if found
              if (startPoint && (trip.start_latitude === 0 || trip.start_longitude === 0)) {
                tripToInsert.start_latitude = startPoint.latitude;
                tripToInsert.start_longitude = startPoint.longitude;
                console.log(`[sync-trips-incremental] Backfilled start coordinates: ${startPoint.latitude}, ${startPoint.longitude}`);
              }
              
              if (endPoint && (trip.end_latitude === 0 || trip.end_longitude === 0)) {
                tripToInsert.end_latitude = endPoint.latitude;
                tripToInsert.end_longitude = endPoint.longitude;
                console.log(`[sync-trips-incremental] Backfilled end coordinates: ${endPoint.latitude}, ${endPoint.longitude}`);
              }
              
              // Recalculate distance if we got new coordinates
              if (startPoint && endPoint && tripToInsert.distance_km === 0) {
                tripToInsert.distance_km = Math.round(calculateDistance(
                  tripToInsert.start_latitude,
                  tripToInsert.start_longitude,
                  tripToInsert.end_latitude,
                  tripToInsert.end_longitude
                ) * 100) / 100;
                console.log(`[sync-trips-incremental] Recalculated distance: ${tripToInsert.distance_km}km`);
              }
            }

            // Insert new trip
            const { error: insertError } = await supabase.from("vehicle_trips").insert(tripToInsert);

            if (insertError) {
              console.error(`[sync-trips-incremental] Error inserting trip: ${insertError.message}`);
              errors.push(`Device ${deviceId} trip insert: ${insertError.message}`);
            } else {
              console.log(`[sync-trips-incremental] Inserted trip: ${trip.start_time} to ${trip.end_time}, ${trip.distance_km}km`);
              deviceTripsCreated++;
              totalTripsCreated++;
            }
          }
          
          // Update progress periodically
          const tripsProcessed = j + batch.length;
          if (tripsProcessed % PROGRESS_UPDATE_INTERVAL === 0 || tripsProcessed >= trips.length) {
            const progressPercent = trips.length > 0 
              ? Math.round((tripsProcessed / trips.length) * 100)
              : 100;
            
            const progressUpdate: any = {
              trips_processed: tripsProcessed,
              sync_progress_percent: progressPercent,
              current_operation: `Processing trip ${Math.min(tripsProcessed, trips.length)} of ${trips.length}`,
            };
            
            const { error: progressError } = await supabase
              .from("trip_sync_status")
              .update(progressUpdate)
              .eq("device_id", deviceId);
            
            // If columns don't exist, just update trips_processed (graceful degradation)
            if (progressError && progressError.message?.includes('column') && progressError.message?.includes('does not exist')) {
              await supabase
                .from("trip_sync_status")
                .update({ trips_processed: tripsProcessed })
                .eq("device_id", deviceId);
            }
          }
        }

        // Update sync status
        const latestTripTime = trips.length > 0 
          ? trips[trips.length - 1].end_time 
          : endDate.toISOString();

        // Update sync status - gracefully handle missing progress columns
        const completionUpdate: any = {
          sync_status: "completed",
          last_sync_at: new Date().toISOString(),
          last_position_processed: latestTripTime,
          trips_processed: deviceTripsCreated,
          trips_total: trips.length,
          sync_progress_percent: 100,
          current_operation: `Completed: ${deviceTripsCreated} trips synced`,
          error_message: null,
        };
        
        const { error: completionError } = await supabase
          .from("trip_sync_status")
          .update(completionUpdate)
          .eq("device_id", deviceId);
        
        // If columns don't exist, update without them (graceful degradation)
        if (completionError && completionError.message?.includes('column') && completionError.message?.includes('does not exist')) {
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
        } else if (completionError) {
          console.warn('[sync-trips-incremental] Error updating completion status:', completionError.message);
        }

        deviceResults[deviceId] = {
          trips: deviceTripsCreated,
          skipped: deviceTripsSkipped,
          total_from_gps51: trips.length,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[sync-trips-incremental] Error processing device ${deviceId}:`, errorMsg);
        errors.push(`Device ${deviceId}: ${errorMsg}`);

        // Update error status - gracefully handle missing progress columns
        const errorUpdate: any = {
          sync_status: "error",
          error_message: errorMsg,
          sync_progress_percent: null,
          current_operation: `Error: ${errorMsg.substring(0, 50)}`,
        };
        
        const { error: errorUpdateErr } = await supabase
          .from("trip_sync_status")
          .update(errorUpdate)
          .eq("device_id", deviceId);
        
        // If columns don't exist, update without them (graceful degradation)
        if (errorUpdateErr && errorUpdateErr.message?.includes('column') && errorUpdateErr.message?.includes('does not exist')) {
          await supabase
            .from("trip_sync_status")
            .update({
              sync_status: "error",
              error_message: errorMsg,
            })
            .eq("device_id", deviceId);
        } else if (errorUpdateErr) {
          console.warn('[sync-trips-incremental] Error updating error status:', errorUpdateErr.message);
        }
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
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[sync-trips-incremental] Fatal error: ${errorMessage}`, errorStack);

    // Log full error details for debugging
    console.error(`[sync-trips-incremental] Error details:`, {
      message: errorMessage,
      stack: errorStack,
      error: error,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
