
-- Audit script for RBC784CX (358657105966092)
-- Date: 2026-02-01 (Today)

WITH lagos_time AS (
  SELECT (NOW() AT TIME ZONE 'Africa/Lagos')::date as today_date
),
raw_data AS (
  SELECT 
    gps_time, 
    gps_time AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos' as lagos_time,
    latitude, 
    longitude, 
    speed, 
    ignition_on
  FROM position_history
  WHERE device_id = '358657105966092'
  AND gps_time >= (SELECT today_date FROM lagos_time)::timestamp AT TIME ZONE 'Africa/Lagos' AT TIME ZONE 'UTC'
  ORDER BY gps_time ASC
)
SELECT * FROM raw_data;

-- Check what the RPC returns
SELECT 
  start_time AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos' as start_lagos,
  end_time AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos' as end_lagos,
  distance_km,
  duration_seconds,
  max_speed
FROM get_vehicle_trips_optimized(
  '358657105966092', 
  100, 
  (CURRENT_DATE)::text, -- Start of today UTC (approx)
  (CURRENT_DATE + 1)::text
);
