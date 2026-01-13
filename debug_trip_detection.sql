-- Debug trip detection for device 358657105967694 today
-- Run this in Supabase SQL Editor

-- 1. Check position_history data availability
SELECT 
  COUNT(*) AS total_positions,
  COUNT(DISTINCT DATE(gps_time)) AS unique_dates,
  MIN(gps_time) AS first_position,
  MAX(gps_time) AS last_position,
  COUNT(CASE WHEN ignition_on = true THEN 1 END) AS ignition_on_count,
  COUNT(CASE WHEN ignition_on = false THEN 1 END) AS ignition_off_count,
  COUNT(CASE WHEN ignition_on IS NULL THEN 1 END) AS ignition_null_count
FROM position_history
WHERE device_id = '358657105967694'
  AND gps_time >= date_trunc('day', now())
  AND gps_time < now();

-- 2. Check ignition state changes (potential trip starts/ends)
WITH ignition_changes AS (
  SELECT 
    gps_time,
    ignition_on,
    LAG(ignition_on) OVER (ORDER BY gps_time) AS prev_ignition,
    speed,
    latitude,
    longitude,
    ROW_NUMBER() OVER (ORDER BY gps_time) AS row_num
  FROM position_history
  WHERE device_id = '358657105967694'
    AND gps_time >= date_trunc('day', now())
    AND gps_time < now()
  ORDER BY gps_time
)
SELECT 
  gps_time,
  ignition_on,
  prev_ignition,
  speed,
  CASE 
    WHEN prev_ignition = false AND ignition_on = true THEN 'TRIP_START'
    WHEN prev_ignition = true AND ignition_on = false THEN 'TRIP_END'
    WHEN prev_ignition IS NULL AND ignition_on = true THEN 'FIRST_IGNITION_ON'
    ELSE 'CONTINUE'
  END AS event_type
FROM ignition_changes
WHERE (prev_ignition = false AND ignition_on = true)
   OR (prev_ignition = true AND ignition_on = false)
   OR (prev_ignition IS NULL AND ignition_on = true)
ORDER BY gps_time;

-- 3. Check existing trips in database
SELECT 
  id,
  start_time,
  end_time,
  ROUND(distance_km::numeric, 2) AS distance_km,
  duration_seconds,
  ROUND(duration_seconds / 60.0, 1) AS duration_minutes
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= date_trunc('day', now())
  AND start_time < now()
ORDER BY start_time;

-- 4. Check trip_sync_status
SELECT 
  device_id,
  sync_status,
  last_position_processed,
  last_sync_at,
  trips_processed,
  error_message
FROM trip_sync_status
WHERE device_id = '358657105967694';

-- 5. Check if position_history has data for the expected trip times
-- Based on GPS51: 07:51, 08:05, 08:22, 11:33, 11:52
SELECT 
  DATE_TRUNC('hour', gps_time) AS hour,
  COUNT(*) AS positions_count,
  COUNT(CASE WHEN ignition_on = true THEN 1 END) AS ignition_on_count,
  MIN(gps_time) AS first_in_hour,
  MAX(gps_time) AS last_in_hour
FROM position_history
WHERE device_id = '358657105967694'
  AND gps_time >= date_trunc('day', now())
  AND gps_time < now()
GROUP BY DATE_TRUNC('hour', gps_time)
ORDER BY hour;
