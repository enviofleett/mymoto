-- Check trips for device 13612332432 today
-- Run this in Supabase SQL Editor

-- Summary: Count and total distance for today
SELECT 
  COUNT(*) as trip_count_today,
  COALESCE(SUM(distance_km), 0) as total_distance_km,
  COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
  COALESCE(ROUND(SUM(duration_seconds) / 60.0, 1), 0) as total_duration_minutes,
  MIN(start_time) as first_trip_start,
  MAX(end_time) as last_trip_end
FROM vehicle_trips
WHERE device_id = '13612332432'
  AND start_time >= date_trunc('day', now())
  AND start_time < now()
  AND end_time IS NOT NULL; -- Only completed trips

-- Individual trips for today (detailed view)
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
WHERE device_id = '13612332432'
  AND start_time >= date_trunc('day', now())
  AND start_time < now()
ORDER BY start_time DESC;
