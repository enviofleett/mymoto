-- Test query to see what trips the frontend should be receiving
-- Replace '358657105967694' with your device ID

-- Test 1: Query exactly as frontend does (no date filter, limit 200)
SELECT 
  id,
  device_id,
  start_time,
  end_time,
  distance_km,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_latitude IS NOT NULL
  AND start_longitude IS NOT NULL
  AND start_latitude != 0
  AND start_longitude != 0
ORDER BY start_time DESC
LIMIT 200;

-- Test 2: Count trips by date (should show all dates)
SELECT 
  DATE(start_time AT TIME ZONE 'UTC') as trip_date,
  COUNT(*) as trip_count
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_latitude IS NOT NULL
  AND start_longitude IS NOT NULL
  AND start_latitude != 0
  AND start_longitude != 0
  AND start_time >= NOW() - INTERVAL '30 days'
GROUP BY DATE(start_time AT TIME ZONE 'UTC')
ORDER BY trip_date DESC;

-- Test 3: Check if there are trips after Monday (Jan 8)
SELECT 
  COUNT(*) as trips_after_monday,
  MIN(start_time) as earliest,
  MAX(start_time) as latest
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_latitude IS NOT NULL
  AND start_longitude IS NOT NULL
  AND start_latitude != 0
  AND start_longitude != 0
  AND start_time > '2026-01-08 23:59:59+00';
