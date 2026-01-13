-- Diagnose missing trips for device 358657105967694 today
-- Run this in Supabase SQL Editor

-- 1. Check position_history data for today
SELECT 
  COUNT(*) AS total_positions,
  MIN(gps_time) AS first_position,
  MAX(gps_time) AS last_position,
  COUNT(DISTINCT DATE(gps_time)) AS days_with_data
FROM position_history
WHERE device_id = '358657105967694'
  AND gps_time >= date_trunc('day', now())
  AND gps_time < now();

-- 2. Check speed distribution (to understand trip detection)
SELECT 
  CASE 
    WHEN speed IS NULL OR speed = 0 THEN '0 (stopped)'
    WHEN speed > 0 AND speed <= 2 THEN '0-2 km/h (very slow)'
    WHEN speed > 2 AND speed <= 10 THEN '2-10 km/h (slow)'
    WHEN speed > 10 AND speed <= 50 THEN '10-50 km/h (normal)'
    WHEN speed > 50 THEN '50+ km/h (fast)'
  END AS speed_range,
  COUNT(*) AS count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS percentage
FROM position_history
WHERE device_id = '358657105967694'
  AND gps_time >= date_trunc('day', now())
  AND gps_time < now()
GROUP BY speed_range
ORDER BY 
  CASE speed_range
    WHEN '0 (stopped)' THEN 1
    WHEN '0-2 km/h (very slow)' THEN 2
    WHEN '2-10 km/h (slow)' THEN 3
    WHEN '10-50 km/h (normal)' THEN 4
    WHEN '50+ km/h (fast)' THEN 5
  END;

-- 3. Check ignition_on status (GPS51 likely uses this)
SELECT 
  ignition_on,
  COUNT(*) AS count,
  MIN(gps_time) AS first_occurrence,
  MAX(gps_time) AS last_occurrence
FROM position_history
WHERE device_id = '358657105967694'
  AND gps_time >= date_trunc('day', now())
  AND gps_time < now()
GROUP BY ignition_on
ORDER BY ignition_on NULLS LAST;

-- 4. Find potential trip starts (ignition ON after OFF)
WITH ignition_changes AS (
  SELECT 
    gps_time,
    ignition_on,
    LAG(ignition_on) OVER (ORDER BY gps_time) AS prev_ignition,
    speed,
    latitude,
    longitude
  FROM position_history
  WHERE device_id = '358657105967694'
    AND gps_time >= date_trunc('day', now())
    AND gps_time < now()
  ORDER BY gps_time
)
SELECT 
  gps_time AS trip_start_time,
  speed,
  latitude,
  longitude,
  CASE 
    WHEN prev_ignition = false AND ignition_on = true THEN 'IGNITION_START'
    WHEN prev_ignition IS NULL AND ignition_on = true THEN 'FIRST_IGNITION_ON'
    ELSE 'OTHER'
  END AS change_type
FROM ignition_changes
WHERE (prev_ignition = false AND ignition_on = true)
   OR (prev_ignition IS NULL AND ignition_on = true)
ORDER BY gps_time;

-- 5. Compare detected trips vs expected trips
SELECT 
  'Detected in DB' AS source,
  COUNT(*) AS trip_count,
  SUM(distance_km) AS total_distance
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= date_trunc('day', now())
  AND start_time < now()
UNION ALL
SELECT 
  'Expected from GPS51' AS source,
  5 AS trip_count,  -- From your screenshot
  20.1 AS total_distance;  -- From your screenshot
