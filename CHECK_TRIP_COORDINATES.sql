-- Check which trips are being filtered out due to missing/invalid coordinates
-- This will help us understand why only Jan 12 trips are showing

-- Check trips by date and their coordinate status
SELECT 
  DATE(start_time AT TIME ZONE 'UTC') as trip_date,
  COUNT(*) as total_trips,
  COUNT(CASE WHEN start_latitude IS NOT NULL AND start_longitude IS NOT NULL 
             AND start_latitude != 0 AND start_longitude != 0 
        THEN 1 END) as has_valid_start,
  COUNT(CASE WHEN end_latitude IS NOT NULL AND end_longitude IS NOT NULL 
             AND end_latitude != 0 AND end_longitude != 0 
        THEN 1 END) as has_valid_end,
  COUNT(CASE WHEN start_latitude IS NOT NULL AND start_longitude IS NOT NULL 
             AND start_latitude != 0 AND start_longitude != 0 
             AND end_latitude IS NOT NULL AND end_longitude IS NOT NULL 
             AND end_latitude != 0 AND end_longitude != 0 
        THEN 1 END) as has_both_valid
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= '2026-01-08 00:00:00+00'
GROUP BY DATE(start_time AT TIME ZONE 'UTC')
ORDER BY trip_date DESC;

-- Show sample trips from each day to see coordinate patterns
SELECT 
  DATE(start_time AT TIME ZONE 'UTC') as trip_date,
  start_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  CASE 
    WHEN start_latitude IS NULL OR start_longitude IS NULL OR start_latitude = 0 OR start_longitude = 0 
    THEN 'Missing Start'
    WHEN end_latitude IS NULL OR end_longitude IS NULL OR end_latitude = 0 OR end_longitude = 0 
    THEN 'Missing End'
    ELSE 'Valid'
  END as coordinate_status
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= '2026-01-08 00:00:00+00'
ORDER BY start_time DESC
LIMIT 50;
