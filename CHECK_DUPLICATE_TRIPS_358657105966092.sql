-- ============================================
-- DUPLICATE TRIPS ANALYSIS FOR DEVICE: 358657105966092
-- ============================================

-- 1. Find exact duplicates (same start_time and end_time)
SELECT 
  start_time,
  end_time,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ' ORDER BY id) as trip_ids,
  STRING_AGG(device_id::text, ', ') as device_ids,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM vehicle_trips
WHERE device_id = '358657105966092'
GROUP BY start_time, end_time
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, start_time DESC
LIMIT 50;

-- 2. Find near-duplicates (same start_time, end_time within 1 second)
SELECT 
  t1.id as trip1_id,
  t2.id as trip2_id,
  t1.start_time,
  t1.end_time as trip1_end_time,
  t2.end_time as trip2_end_time,
  ABS(EXTRACT(EPOCH FROM (t1.end_time - t2.end_time))) as end_time_diff_seconds,
  t1.distance_km as trip1_distance,
  t2.distance_km as trip2_distance,
  t1.created_at as trip1_created,
  t2.created_at as trip2_created
FROM vehicle_trips t1
INNER JOIN vehicle_trips t2 
  ON t1.device_id = t2.device_id
  AND t1.start_time = t2.start_time
  AND t1.id < t2.id
  AND ABS(EXTRACT(EPOCH FROM (t1.end_time - t2.end_time))) <= 1
WHERE t1.device_id = '358657105966092'
ORDER BY t1.start_time DESC
LIMIT 50;

-- 3. Find duplicates with same coordinates (likely same trip)
SELECT 
  t1.id as trip1_id,
  t2.id as trip2_id,
  t1.start_time,
  t1.end_time,
  t1.start_latitude,
  t1.start_longitude,
  t1.end_latitude,
  t1.end_longitude,
  t1.distance_km,
  t2.distance_km as trip2_distance,
  t1.created_at as trip1_created,
  t2.created_at as trip2_created
FROM vehicle_trips t1
INNER JOIN vehicle_trips t2 
  ON t1.device_id = t2.device_id
  AND t1.start_time = t2.start_time
  AND t1.id < t2.id
  AND t1.start_latitude = t2.start_latitude
  AND t1.start_longitude = t2.start_longitude
  AND t1.end_latitude = t2.end_latitude
  AND t1.end_longitude = t2.end_longitude
WHERE t1.device_id = '358657105966092'
ORDER BY t1.start_time DESC
LIMIT 50;

-- 4. Summary: Total duplicates count
SELECT 
  COUNT(*) as total_duplicate_groups,
  SUM(duplicate_count - 1) as total_duplicate_trips,
  MAX(duplicate_count) as max_duplicates_in_group
FROM (
  SELECT 
    start_time,
    end_time,
    COUNT(*) as duplicate_count
  FROM vehicle_trips
  WHERE device_id = '358657105966092'
  GROUP BY start_time, end_time
  HAVING COUNT(*) > 1
) duplicates;

-- 5. Recent duplicates (last 7 days)
SELECT 
  start_time,
  end_time,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ' ORDER BY id) as trip_ids
FROM vehicle_trips
WHERE device_id = '358657105966092'
  AND start_time >= NOW() - INTERVAL '7 days'
GROUP BY start_time, end_time
HAVING COUNT(*) > 1
ORDER BY start_time DESC;
