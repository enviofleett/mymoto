-- =====================================================
-- Comprehensive Comparison: GPS51 Data vs Database
-- Device: 13612333441
-- =====================================================

-- STEP 1: Analyze Database State
-- Get current database statistics
SELECT 
  'DATABASE SUMMARY' as source,
  COUNT(*) as total_trips,
  COUNT(DISTINCT (start_time, end_time)) as unique_trips,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip,
  SUM(distance_km) as total_distance_km,
  COUNT(CASE WHEN start_latitude != 0 AND start_longitude != 0 AND end_latitude != 0 AND end_longitude != 0 THEN 1 END) as trips_with_coords,
  COUNT(CASE WHEN distance_km >= 0.1 THEN 1 END) as trips_over_100m,
  COUNT(CASE WHEN duration_seconds > 0 THEN 1 END) as trips_with_duration
FROM vehicle_trips
WHERE device_id = '13612333441';

-- STEP 2: Find Duplicate Trips in Database
-- This shows trips that have multiple entries (should be deduplicated)
WITH trip_counts AS (
  SELECT 
    start_time AT TIME ZONE 'UTC' as start_time_utc,
    end_time AT TIME ZONE 'UTC' as end_time_utc,
    COUNT(*) as duplicate_count
  FROM vehicle_trips
  WHERE device_id = '13612333441'
  GROUP BY start_time, end_time
  HAVING COUNT(*) > 1
)
SELECT 
  'DUPLICATES IN DATABASE' as issue_type,
  COUNT(*) as duplicate_groups,
  SUM(duplicate_count) as total_duplicate_trips,
  SUM(duplicate_count - 1) as trips_to_delete
FROM trip_counts;

-- STEP 3: List Sample Duplicates (to verify pattern matches GPS51 data)
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
  'SAMPLE DUPLICATES' as info,
  start_time_utc,
  end_time_utc,
  distance_km,
  duration_seconds,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ' ORDER BY created_at DESC) as trip_ids
FROM duplicates
WHERE rn = 1  -- Get one record per duplicate group
  AND EXISTS (
    SELECT 1 FROM duplicates d2 
    WHERE d2.start_time_utc = duplicates.start_time_utc 
      AND d2.end_time_utc = duplicates.end_time_utc
      AND d2.rn > 1
  )
GROUP BY start_time_utc, end_time_utc, distance_km, duration_seconds
ORDER BY start_time_utc DESC
LIMIT 20;

-- STEP 4: Analyze Trip Quality Issues
SELECT 
  'QUALITY ISSUES' as category,
  COUNT(*) as total_trips,
  COUNT(CASE WHEN (start_latitude = 0 OR start_longitude = 0 OR end_latitude = 0 OR end_longitude = 0) THEN 1 END) as missing_coords,
  COUNT(CASE WHEN distance_km = 0 THEN 1 END) as zero_distance,
  COUNT(CASE WHEN duration_seconds = 0 AND start_time != end_time THEN 1 END) as zero_duration_issue,
  COUNT(CASE WHEN distance_km < 0.1 THEN 1 END) as trips_under_100m
FROM vehicle_trips
WHERE device_id = '13612333441';

-- STEP 5: Get Unique Trips Count (after deduplication)
-- This is what should match GPS51 after their deduplication
SELECT 
  'UNIQUE TRIPS COUNT' as metric,
  COUNT(DISTINCT (start_time, end_time)) as unique_trips,
  COUNT(DISTINCT DATE(start_time AT TIME ZONE 'UTC')) as days_with_trips
FROM vehicle_trips
WHERE device_id = '13612333441';

-- STEP 6: Daily Breakdown of Unique Trips
-- This helps compare with GPS51 daily counts
SELECT 
  DATE(start_time AT TIME ZONE 'UTC') as trip_date,
  COUNT(DISTINCT (start_time, end_time)) as unique_trips,
  SUM(distance_km) as total_distance_km,
  COUNT(CASE WHEN distance_km >= 0.1 THEN 1 END) as valid_trips_over_100m
FROM vehicle_trips
WHERE device_id = '13612333441'
GROUP BY DATE(start_time AT TIME ZONE 'UTC')
ORDER BY trip_date DESC;

-- STEP 7: Compare Specific Trip Times from GPS51 Data
-- These are example trips from GPS51 that should exist in database
-- Adjust the times to match GPS51 data you uploaded
SELECT 
  'VERIFY SPECIFIC TRIPS' as check_type,
  start_time AT TIME ZONE 'UTC' as start_time_utc,
  end_time AT TIME ZONE 'UTC' as end_time_utc,
  distance_km,
  duration_seconds,
  COUNT(*) as occurrences
FROM vehicle_trips
WHERE device_id = '13612333441'
  AND (
    (start_time AT TIME ZONE 'UTC')::timestamp = '2026-01-16 13:56:02.186'
    OR (start_time AT TIME ZONE 'UTC')::timestamp = '2026-01-16 13:47:18.685'
    OR (start_time AT TIME ZONE 'UTC')::timestamp = '2026-01-16 12:25:48.588'
    OR (start_time AT TIME ZONE 'UTC')::timestamp = '2026-01-15 21:41:35.985'
  )
GROUP BY start_time, end_time, distance_km, duration_seconds
ORDER BY start_time DESC;
