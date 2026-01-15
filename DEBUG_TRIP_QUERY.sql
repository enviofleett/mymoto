-- Debug query to check what trips exist in the database
-- Replace 'YOUR_DEVICE_ID' with your actual device ID

-- Check total trips count
SELECT COUNT(*) as total_trips
FROM vehicle_trips
WHERE device_id = '358657105967694';

-- Check trips by date (last 7 days)
SELECT 
  DATE(start_time AT TIME ZONE 'UTC') as trip_date,
  COUNT(*) as trip_count,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= NOW() - INTERVAL '7 days'
GROUP BY DATE(start_time AT TIME ZONE 'UTC')
ORDER BY trip_date DESC;

-- Check most recent trips (last 20)
SELECT 
  id,
  device_id,
  start_time,
  end_time,
  distance_km,
  DATE(start_time AT TIME ZONE 'UTC') as trip_date,
  start_latitude,
  start_longitude
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_latitude IS NOT NULL
  AND start_longitude IS NOT NULL
  AND start_latitude != 0
  AND start_longitude != 0
ORDER BY start_time DESC
LIMIT 20;

-- Check if there are trips after Monday
SELECT 
  COUNT(*) as trips_after_monday
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= DATE_TRUNC('week', NOW()) + INTERVAL '1 day' -- Tuesday of this week
  AND start_latitude IS NOT NULL
  AND start_longitude IS NOT NULL
  AND start_latitude != 0
  AND start_longitude != 0;
