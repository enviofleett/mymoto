-- Count trips for device 358657105967694 today
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql

-- Get today's date range (start of today to now)
WITH today_range AS (
  SELECT 
    date_trunc('day', now()) AS today_start,
    now() AS today_end
)
SELECT 
  COUNT(*) AS total_trips_today,
  COALESCE(SUM(distance_km), 0) AS total_distance_km,
  COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
  COALESCE(ROUND(SUM(duration_seconds) / 60.0, 1), 0) AS total_duration_minutes,
  MIN(start_time) AS first_trip_start,
  MAX(end_time) AS last_trip_end
FROM vehicle_trips, today_range
WHERE device_id = '358657105967694'
  AND start_time >= today_range.today_start
  AND start_time < today_range.today_end;

-- Also show individual trips for today
SELECT 
  id,
  start_time,
  end_time,
  ROUND(distance_km::numeric, 2) AS distance_km,
  ROUND(max_speed::numeric, 1) AS max_speed_kmh,
  ROUND(avg_speed::numeric, 1) AS avg_speed_kmh,
  duration_seconds,
  ROUND(duration_seconds / 60.0, 1) AS duration_minutes,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= date_trunc('day', now())
  AND start_time < now()
ORDER BY start_time DESC;
