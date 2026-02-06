
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env vars manually
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key && value) {
      acc[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
    }
    return acc;
  }, {} as Record<string, string>);

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
// Use hardcoded service role key found in scripts/analyze_trips_gap.ts
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs";

console.log('Connecting to Supabase at:', supabaseUrl);

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- Definitions ---

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
  source?: string;
}

const GPS51_TRIP_THRESHOLDS = {
  MIN_DISTANCE_KM: 0.5,
  MIN_DURATION_SEC: 180,
  MAX_SPEED_KMH: 200,
  MIN_DISPLACEMENT_KM: 0.05,
  SPIKE_SPEED_KMH: 250,
  IDLE_TIMEOUT_SEC: 180,
};

function normalizeSpeed(rawSpeed: number | null | undefined): number {
  if (rawSpeed === null || rawSpeed === undefined || Number.isNaN(rawSpeed)) {
    return 0;
  }
  const numSpeed = typeof rawSpeed === 'string' ? parseFloat(rawSpeed) : rawSpeed;
  if (Number.isNaN(numSpeed)) return 0;
  const speed = Math.max(0, numSpeed);
  // Simple heuristic: > 1000 is m/h, convert to km/h
  if (speed > 1000) return speed / 1000;
  return speed;
}

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

function filterPositionSpikes(positions: PositionPoint[]): PositionPoint[] {
  if (positions.length < 2) return positions;

  const filtered: PositionPoint[] = [positions[0]];
  const MAX_JUMP_DISTANCE_KM = 10;
  const MAX_JUMP_SPEED_KMH = 250;

  for (let i = 1; i < positions.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = positions[i];

    const distance = calculateDistance(
      prev.latitude, prev.longitude,
      curr.latitude, curr.longitude
    );

    const timeDiffMs = new Date(curr.gps_time).getTime() - new Date(prev.gps_time).getTime();
    const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

    const impliedSpeed = timeDiffHours > 0 ? distance / timeDiffHours : 0;

    if (distance > MAX_JUMP_DISTANCE_KM) continue;
    if (impliedSpeed > MAX_JUMP_SPEED_KMH) continue;

    filtered.push(curr);
  }
  return filtered;
}

function smoothSpeedData(positions: PositionPoint[], windowSize: number = 3): PositionPoint[] {
  if (positions.length < windowSize) return positions;

  return positions.map((pos, index) => {
    const start = Math.max(0, index - Math.floor(windowSize / 2));
    const end = Math.min(positions.length, index + Math.ceil(windowSize / 2));
    const window = positions.slice(start, end);

    const validSpeeds = window
      .map(p => normalizeSpeed(p.speed))
      .filter(s => s >= 0 && s < GPS51_TRIP_THRESHOLDS.MAX_SPEED_KMH);

    if (validSpeeds.length === 0) return pos;

    const avgSpeed = validSpeeds.reduce((sum, s) => sum + s, 0) / validSpeeds.length;
    const currentSpeed = normalizeSpeed(pos.speed);
    
    if (currentSpeed > avgSpeed * 2 && currentSpeed > GPS51_TRIP_THRESHOLDS.MAX_SPEED_KMH) {
      return { ...pos, speed: avgSpeed };
    }
    return pos;
  });
}

function extractTripsFromHistory(positions: PositionPoint[]): TripData[] {
  if (positions.length < 2) return [];

  let cleanedPositions = filterPositionSpikes(positions);
  cleanedPositions = smoothSpeedData(cleanedPositions, 3);
  positions = cleanedPositions;

  const trips: TripData[] = [];
  let currentTrip: { 
    points: PositionPoint[];
    startOdometer?: number | null;
    lastMovingTime?: number;
  } | null = null;
  
  const MIN_TRIP_DISTANCE = 0.1;
  const IDLE_TIMEOUT_MS = 180 * 1000;
  const MAX_TIME_GAP_MS = 30 * 60 * 1000;
  const SPEED_THRESHOLD = 5.0;

  const MIN_IGNITION_CONFIDENCE = 0.5;
  const hasHardwareAcc = positions.some(p => {
    const isStatusBit = p.ignition_detection_method === 'status_bit';
    const isStringParse = p.ignition_detection_method === 'string_parse';
    const hasConfidence = p.ignition_confidence !== null && p.ignition_confidence !== undefined;
    const confidenceOk = hasConfidence ? p.ignition_confidence! >= MIN_IGNITION_CONFIDENCE : false;
    
    return p.ignition_on === true && (
      (isStatusBit && confidenceOk) || 
      (isStringParse && confidenceOk)
    );
  });
  const hasIgnitionData = positions.some(p => p.ignition_on !== null && p.ignition_on !== undefined);
  const useIgnitionDetection = hasIgnitionData && hasHardwareAcc;

  console.log(`Using ${useIgnitionDetection ? 'ignition-based' : 'speed-based'} detection`);
  console.log(`Sample ignition data:`, positions.slice(0, 5).map(p => ({ on: p.ignition_on, method: p.ignition_detection_method, conf: p.ignition_confidence })));

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const speed = normalizeSpeed(pos.speed);
    
    // Ignition check
    let isIgnitionOn = false;
    if (useIgnitionDetection) {
        const isStatusBit = pos.ignition_detection_method === 'status_bit';
        const isStringParse = pos.ignition_detection_method === 'string_parse';
        const hasConfidence = pos.ignition_confidence !== null && pos.ignition_confidence !== undefined;
        const confidenceOk = hasConfidence ? pos.ignition_confidence! >= MIN_IGNITION_CONFIDENCE : false;
        
        if (pos.ignition_on === true && ((isStatusBit && confidenceOk) || (isStringParse && confidenceOk))) {
            isIgnitionOn = true;
        }
    }

    const isMoving = speed > SPEED_THRESHOLD;

    if (currentTrip) {
      const lastPoint = currentTrip.points[currentTrip.points.length - 1];
      const timeDiff = new Date(pos.gps_time).getTime() - new Date(lastPoint.gps_time).getTime();

      let shouldEndTrip = false;
      let reason = '';

      if (timeDiff > MAX_TIME_GAP_MS) {
        shouldEndTrip = true;
        reason = 'max time gap';
      } else if (useIgnitionDetection && !isIgnitionOn) {
         const lastMovingTime = currentTrip.lastMovingTime || new Date(currentTrip.points[0].gps_time).getTime();
         const timeSinceMove = new Date(pos.gps_time).getTime() - lastMovingTime;
         
         if (timeSinceMove > IDLE_TIMEOUT_MS) {
             shouldEndTrip = true;
             reason = 'ignition off / idle timeout';
         }
      } else if (!useIgnitionDetection && !isMoving) {
          const lastMovingTime = currentTrip.lastMovingTime || new Date(currentTrip.points[0].gps_time).getTime();
          const timeSinceMove = new Date(pos.gps_time).getTime() - lastMovingTime;
          if (timeSinceMove > IDLE_TIMEOUT_MS) {
              shouldEndTrip = true;
              reason = 'idle timeout (speed)';
          }
      }

      if (shouldEndTrip) {
        const start = currentTrip.points[0];
        const end = currentTrip.points[currentTrip.points.length - 1];
        const dist = calculateDistance(start.latitude, start.longitude, end.latitude, end.longitude);
        
        if (dist >= MIN_TRIP_DISTANCE) {
            trips.push({
                device_id: start.device_id,
                start_time: start.gps_time,
                end_time: end.gps_time,
                distance_km: dist,
                duration_seconds: (new Date(end.gps_time).getTime() - new Date(start.gps_time).getTime()) / 1000,
                start_latitude: start.latitude,
                start_longitude: start.longitude,
                end_latitude: end.latitude,
                end_longitude: end.longitude,
                max_speed: 0, avg_speed: 0
            });
        }
        currentTrip = null;
      } else {
        currentTrip.points.push(pos);
        if (isMoving || (useIgnitionDetection && isIgnitionOn)) {
            currentTrip.lastMovingTime = new Date(pos.gps_time).getTime();
        }
      }

    } else {
      let startTrip = false;
      if (useIgnitionDetection && isIgnitionOn) {
          startTrip = true;
      } else if (!useIgnitionDetection && isMoving) {
          startTrip = true;
      }

      if (startTrip) {
        currentTrip = {
            points: [pos],
            lastMovingTime: new Date(pos.gps_time).getTime()
        };
      }
    }
  }
  
  if (currentTrip) {
      const start = currentTrip.points[0];
      const end = currentTrip.points[currentTrip.points.length - 1];
      const dist = calculateDistance(start.latitude, start.longitude, end.latitude, end.longitude);
      if (dist >= MIN_TRIP_DISTANCE) {
          trips.push({
                device_id: start.device_id,
                start_time: start.gps_time,
                end_time: end.gps_time,
                distance_km: dist,
                duration_seconds: (new Date(end.gps_time).getTime() - new Date(start.gps_time).getTime()) / 1000,
                start_latitude: start.latitude,
                start_longitude: start.longitude,
                end_latitude: end.latitude,
                end_longitude: end.longitude,
                max_speed: 0, avg_speed: 0
            });
      }
  }

  return trips;
}

// --- Main ---

async function run() {
  const deviceId = '358657105966092'; // RBC784CX
  console.log(`Fetching positions for ${deviceId}...`);
  
  console.time('fetch');
  // Fetch 1 hour around known activity (previously worked)
  const targetTime = '2026-02-06T11:02:12+00:00';
  const startTime = new Date(new Date(targetTime).getTime() - 30 * 60 * 1000); 
  const endTime = new Date(new Date(targetTime).getTime() + 30 * 60 * 1000);

  console.log(`Fetching positions from ${startTime.toISOString()} to ${endTime.toISOString()}...`);

  const { data: positions, error } = await supabase
    .from('position_history')
    .select('gps_time, speed, ignition_on, latitude, longitude, ignition_confidence, ignition_detection_method')
    .eq('device_id', deviceId)
    .gte('gps_time', startTime.toISOString())
    .lte('gps_time', endTime.toISOString())
    .order('gps_time', { ascending: true })
    .limit(1000);
  console.timeEnd('fetch');

  if (error) {
    console.error('Error fetching positions:', error);
    return;
  }
  
  console.log(`Fetched ${positions.length} positions.`);
  
  if (positions.length > 0) {
      const trips = extractTripsFromHistory(positions as unknown as PositionPoint[]);
      console.log(`Extracted ${trips.length} trips.`);
      console.log(JSON.stringify(trips, null, 2));

      if (trips.length > 0) {
         console.log('Inserting/Upserting trips into vehicle_trips...');
         
         for (const trip of trips) {
             // Check if trip already exists
             const { data: existing } = await supabase
                .from('vehicle_trips')
                .select('id')
                .eq('device_id', deviceId)
                .eq('start_time', trip.start_time)
                .maybeSingle();

             if (!existing) {
                 const tripToInsert = {
                   ...trip,
                   device_id: deviceId,
                   source: 'manual_backfill_fix',
                   created_at: new Date().toISOString()
                 };

                 const { error: insertError } = await supabase
                   .from('vehicle_trips')
                   .insert(tripToInsert);
                   
                 if (insertError) {
                   console.error(`Error inserting trip starting ${trip.start_time}:`, insertError);
                 } else {
                   console.log(`Successfully inserted trip starting ${trip.start_time}!`);
                 }
             } else {
                 console.log(`Trip starting ${trip.start_time} already exists. Skipping.`);
             }
         }
       }
  }
}

run();
