-- Check trips for vehicle RBC784CX
-- Run this in Supabase SQL Editor

-- First, find the device_id for RBC784CX
SELECT 
  device_id,
  device_name,
  gps_owner,
  status,
  last_updated
FROM vehicles
WHERE device_name = 'RBC784CX'
LIMIT 1;

-- If device_id is found, use it in the queries below
-- Replace 'DEVICE_ID_HERE' with the actual device_id from above

-- Total trip count (all time)
SELECT 
  COUNT(*) as total_trip_count,
  COALESCE(SUM(distance_km), 0) as total_distance_km,
  COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
  COALESCE(ROUND(SUM(duration_seconds) / 60.0, 1), 0) as total_duration_minutes,
  MIN(start_time) as first_trip_start,
  MAX(end_time) as last_trip_end
FROM vehicle_trips
WHERE device_id IN (
  SELECT device_id FROM vehicles WHERE device_name = 'RBC784CX'
)
AND end_time IS NOT NULL; -- Only completed trips

-- Trips for today
SELECT 
  COUNT(*) as trip_count_today,
  COALESCE(SUM(distance_km), 0) as total_distance_km_today,
  COALESCE(SUM(duration_seconds), 0) as total_duration_seconds_today,
  COALESCE(ROUND(SUM(duration_seconds) / 60.0, 1), 0) as total_duration_minutes_today,
  MIN(start_time) as first_trip_start,
  MAX(end_time) as last_trip_end
FROM vehicle_trips
WHERE device_id IN (
  SELECT device_id FROM vehicles WHERE device_name = 'RBC784CX'
)
AND start_time >= date_trunc('day', now())
AND start_time < now()
AND end_time IS NOT NULL; -- Only completed trips

-- Recent trips (last 10)
SELECT 
  id,
  start_time,
  end_time,
  ROUND(COALESCE(distance_km, 0)::numeric, 2) AS distance_km,
  ROUND(COALESCE(max_speed, 0)::numeric, 1) AS max_speed_kmh,
  ROUND(COALESCE(avg_speed, 0)::numeric, 1) AS avg_speed_kmh,
  COALESCE(duration_seconds, 0) AS duration_seconds,
  ROUND(COALESCE(duration_seconds, 0) / 60.0, 1) AS duration_minutes,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude
FROM vehicle_trips
WHERE device_id IN (
  SELECT device_id FROM vehicles WHERE device_name = 'RBC784CX'
)
AND end_time IS NOT NULL
ORDER BY start_time DESC
LIMIT 10;
