-- ============================================
-- TRIP REPORT AUDIT FOR DEVICE: 358657105966092
-- ============================================

-- 1. OVERVIEW: Total trips and date range
SELECT 
  COUNT(*) as total_trips,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip,
  COUNT(DISTINCT DATE(start_time)) as unique_days_with_trips
FROM vehicle_trips
WHERE device_id = '358657105966092';

-- 2. TRIPS WITH MISSING/INVALID DATA
SELECT 
  'Missing start_time' as issue_type,
  COUNT(*) as count
FROM vehicle_trips
WHERE device_id = '358657105966092' AND start_time IS NULL

UNION ALL

SELECT 
  'Missing end_time' as issue_type,
  COUNT(*) as count
FROM vehicle_trips
WHERE device_id = '358657105966092' AND end_time IS NULL

UNION ALL

SELECT 
  'Zero coordinates (start)' as issue_type,
  COUNT(*) as count
FROM vehicle_trips
WHERE device_id = '358657105966092' 
  AND (start_latitude = 0 OR start_longitude = 0 OR start_latitude IS NULL OR start_longitude IS NULL)

UNION ALL

SELECT 
  'Zero coordinates (end)' as issue_type,
  COUNT(*) as count
FROM vehicle_trips
WHERE device_id = '358657105966092' 
  AND (end_latitude = 0 OR end_longitude = 0 OR end_latitude IS NULL OR end_longitude IS NULL)

UNION ALL

SELECT 
  'Zero distance' as issue_type,
  COUNT(*) as count
FROM vehicle_trips
WHERE device_id = '358657105966092' 
  AND (distance_km = 0 OR distance_km IS NULL)

UNION ALL

SELECT 
  'Missing duration' as issue_type,
  COUNT(*) as count
FROM vehicle_trips
WHERE device_id = '358657105966092' 
  AND (duration_seconds IS NULL OR duration_seconds = 0)

UNION ALL

SELECT 
  'Invalid time order (end before start)' as issue_type,
  COUNT(*) as count
FROM vehicle_trips
WHERE device_id = '358657105966092' 
  AND end_time < start_time;

-- 3. TRIPS BY DATE (Last 30 days)
SELECT 
  DATE(start_time) as trip_date,
  COUNT(*) as trip_count,
  SUM(distance_km) as total_distance_km,
  AVG(distance_km) as avg_distance_km,
  SUM(duration_seconds) / 3600.0 as total_duration_hours,
  COUNT(CASE WHEN start_latitude = 0 OR start_longitude = 0 THEN 1 END) as trips_with_zero_coords,
  COUNT(CASE WHEN distance_km = 0 OR distance_km IS NULL THEN 1 END) as trips_with_zero_distance
FROM vehicle_trips
WHERE device_id = '358657105966092'
  AND start_time >= NOW() - INTERVAL '30 days'
GROUP BY DATE(start_time)
ORDER BY trip_date DESC;

-- 4. RECENT TRIPS DETAIL (Last 10 trips)
SELECT 
  id,
  start_time,
  end_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  distance_km,
  duration_seconds,
  avg_speed,
  max_speed,
  CASE 
    WHEN start_latitude = 0 OR start_longitude = 0 THEN 'Missing start coords'
    WHEN end_latitude = 0 OR end_longitude = 0 THEN 'Missing end coords'
    WHEN distance_km = 0 OR distance_km IS NULL THEN 'Zero distance'
    WHEN duration_seconds IS NULL OR duration_seconds = 0 THEN 'Missing duration'
    WHEN end_time < start_time THEN 'Invalid time order'
    ELSE 'OK'
  END as data_quality
FROM vehicle_trips
WHERE device_id = '358657105966092'
ORDER BY start_time DESC
LIMIT 10;

-- 5. TRIPS WITH CALCULABLE DISTANCE BUT ZERO STORED
SELECT 
  id,
  start_time,
  end_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  distance_km as stored_distance,
  -- Calculate distance using Haversine formula
  (
    6371 * acos(
      cos(radians(start_latitude)) * 
      cos(radians(end_latitude)) * 
      cos(radians(end_longitude) - radians(start_longitude)) + 
      sin(radians(start_latitude)) * 
      sin(radians(end_latitude))
    )
  ) as calculated_distance_km,
  duration_seconds,
  avg_speed
FROM vehicle_trips
WHERE device_id = '358657105966092'
  AND start_latitude != 0 
  AND start_longitude != 0
  AND end_latitude != 0 
  AND end_longitude != 0
  AND (distance_km = 0 OR distance_km IS NULL)
ORDER BY start_time DESC
LIMIT 20;

-- 6. TRIP DURATION ANALYSIS
SELECT 
  duration_category,
  COUNT(*) as trip_count,
  AVG(distance_km) as avg_distance_km,
  AVG(avg_speed) as avg_speed_kmh
FROM (
  SELECT 
    CASE 
      WHEN duration_seconds IS NULL THEN 'NULL'
      WHEN duration_seconds = 0 THEN 'Zero'
      WHEN duration_seconds < 60 THEN '< 1 min'
      WHEN duration_seconds < 300 THEN '1-5 min'
      WHEN duration_seconds < 1800 THEN '5-30 min'
      WHEN duration_seconds < 3600 THEN '30-60 min'
      ELSE '> 1 hour'
    END as duration_category,
    distance_km,
    avg_speed
  FROM vehicle_trips
  WHERE device_id = '358657105966092'
) subq
GROUP BY duration_category
ORDER BY 
  CASE duration_category
    WHEN 'NULL' THEN 1
    WHEN 'Zero' THEN 2
    WHEN '< 1 min' THEN 3
    WHEN '1-5 min' THEN 4
    WHEN '5-30 min' THEN 5
    WHEN '30-60 min' THEN 6
    ELSE 7
  END;

-- 7. DISTANCE DISTRIBUTION
SELECT 
  distance_category,
  COUNT(*) as trip_count,
  AVG(duration_seconds) / 60.0 as avg_duration_minutes
FROM (
  SELECT 
    CASE 
      WHEN distance_km IS NULL OR distance_km = 0 THEN 'Zero/NULL'
      WHEN distance_km < 0.1 THEN '< 100m'
      WHEN distance_km < 1 THEN '100m - 1km'
      WHEN distance_km < 5 THEN '1-5 km'
      WHEN distance_km < 10 THEN '5-10 km'
      WHEN distance_km < 50 THEN '10-50 km'
      ELSE '> 50 km'
    END as distance_category,
    duration_seconds
  FROM vehicle_trips
  WHERE device_id = '358657105966092'
) subq
GROUP BY distance_category
ORDER BY 
  CASE distance_category
    WHEN 'Zero/NULL' THEN 1
    WHEN '< 100m' THEN 2
    WHEN '100m - 1km' THEN 3
    WHEN '1-5 km' THEN 4
    WHEN '5-10 km' THEN 5
    WHEN '10-50 km' THEN 6
    ELSE 7
  END;

-- 8. CHECK FOR DUPLICATE TRIPS (same start/end time)
SELECT 
  start_time,
  end_time,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as trip_ids
FROM vehicle_trips
WHERE device_id = '358657105966092'
GROUP BY start_time, end_time
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, start_time DESC;

-- 9. TRIPS WITH ESTIMATED DISTANCE (has duration/speed but no GPS distance)
SELECT 
  id,
  start_time,
  end_time,
  distance_km as stored_distance,
  duration_seconds,
  avg_speed,
  CASE 
    WHEN duration_seconds > 0 AND avg_speed > 0 THEN (duration_seconds / 3600.0) * avg_speed
    WHEN duration_seconds > 0 THEN (duration_seconds / 3600.0) * 5.0  -- Assume 5 km/h minimum
    ELSE NULL
  END as estimated_distance_km,
  CASE 
    WHEN start_latitude = 0 OR start_longitude = 0 OR end_latitude = 0 OR end_longitude = 0 THEN 'No GPS coords'
    ELSE 'Has GPS coords'
  END as gps_status
FROM vehicle_trips
WHERE device_id = '358657105966092'
  AND (distance_km = 0 OR distance_km IS NULL)
  AND duration_seconds > 0
ORDER BY start_time DESC
LIMIT 20;
