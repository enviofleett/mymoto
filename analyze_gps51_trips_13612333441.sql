-- =====================================================
-- Analyze GPS51 Trip Data vs Database for Device 13612333441
-- =====================================================

-- 1. Check for duplicate trips in database (same start_time, end_time)
SELECT 
  start_time AT TIME ZONE 'UTC' as start_time_utc,
  end_time AT TIME ZONE 'UTC' as end_time_utc,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ' ORDER BY created_at) as trip_ids
FROM vehicle_trips
WHERE device_id = '13612333441'
GROUP BY start_time, end_time
HAVING COUNT(*) > 1
ORDER BY start_time DESC
LIMIT 50;

-- 2. Get unique trips count by date for comparison
SELECT 
  DATE(start_time AT TIME ZONE 'UTC') as trip_date,
  COUNT(DISTINCT (start_time, end_time)) as unique_trips,
  COUNT(*) as total_trips_in_db,
  SUM(distance_km) as daily_distance_km
FROM vehicle_trips
WHERE device_id = '13612333441'
GROUP BY DATE(start_time AT TIME ZONE 'UTC')
ORDER BY trip_date DESC;

-- 3. Find trips with invalid data (zero coordinates, zero distance, zero duration)
SELECT 
  COUNT(*) as invalid_trips,
  SUM(CASE WHEN (start_latitude = 0 OR start_longitude = 0 OR end_latitude = 0 OR end_longitude = 0) THEN 1 ELSE 0 END) as zero_coords,
  SUM(CASE WHEN distance_km = 0 THEN 1 ELSE 0 END) as zero_distance,
  SUM(CASE WHEN duration_seconds = 0 AND start_time != end_time THEN 1 ELSE 0 END) as zero_duration_issue
FROM vehicle_trips
WHERE device_id = '13612333441';

-- 4. Get trip summary statistics
SELECT 
  COUNT(*) as total_trips,
  COUNT(DISTINCT (start_time, end_time)) as unique_trips,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip,
  SUM(distance_km) as total_distance_km,
  AVG(distance_km) as avg_distance_km,
  COUNT(CASE WHEN start_latitude != 0 AND start_longitude != 0 AND end_latitude != 0 AND end_longitude != 0 THEN 1 END) as trips_with_coords
FROM vehicle_trips
WHERE device_id = '13612333441';

-- 5. Find trips that should be removed (duplicates, invalid data)
-- This identifies the OLDER duplicate trips (keep the most recent one)
WITH duplicates AS (
  SELECT 
    id,
    start_time,
    end_time,
    ROW_NUMBER() OVER (PARTITION BY start_time, end_time ORDER BY created_at DESC) as rn
  FROM vehicle_trips
  WHERE device_id = '13612333441'
)
SELECT 
  COUNT(*) as trips_to_delete,
  STRING_AGG(id::text, ', ') as ids_to_delete
FROM duplicates
WHERE rn > 1;

-- 6. Detailed view of duplicate trips
WITH duplicates AS (
  SELECT 
    id,
    start_time AT TIME ZONE 'UTC' as start_time_utc,
    end_time AT TIME ZONE 'UTC' as end_time_utc,
    distance_km,
    duration_seconds,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY start_time, end_time ORDER BY created_at DESC) as rn
  FROM vehicle_trips
  WHERE device_id = '13612333441'
)
SELECT 
  id,
  start_time_utc,
  end_time_utc,
  distance_km,
  duration_seconds,
  created_at,
  CASE WHEN rn = 1 THEN 'KEEP (newest)' ELSE 'DELETE (duplicate)' END as action
FROM duplicates
WHERE EXISTS (
  SELECT 1 FROM duplicates d2 
  WHERE d2.start_time_utc = duplicates.start_time_utc 
    AND d2.end_time_utc = duplicates.end_time_utc
    AND d2.rn > 1
)
ORDER BY start_time_utc DESC, created_at DESC
LIMIT 100;
