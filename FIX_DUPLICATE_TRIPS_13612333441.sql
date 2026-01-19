-- =====================================================
-- Fix Duplicate Trips for Device 13612333441
-- =====================================================
-- This script removes duplicate trips, keeping only the most recent one
-- for each unique (start_time, end_time) combination

-- STEP 1: Preview what will be deleted (run this first to verify)
WITH duplicates AS (
  SELECT 
    id,
    start_time,
    end_time,
    distance_km,
    duration_seconds,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY start_time, end_time ORDER BY created_at DESC) as rn
  FROM vehicle_trips
  WHERE device_id = '13612333441'
)
SELECT 
  COUNT(*) as trips_to_delete,
  'These are duplicates that will be removed' as note
FROM duplicates
WHERE rn > 1;

-- STEP 2: Actually delete duplicates (keeping the newest one)
-- IMPORTANT: Review the preview above before running this!
DELETE FROM vehicle_trips
WHERE id IN (
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (PARTITION BY start_time, end_time ORDER BY created_at DESC) as rn
    FROM vehicle_trips
    WHERE device_id = '13612333441'
  )
  SELECT id
  FROM duplicates
  WHERE rn > 1
);

-- STEP 3: Verify duplicates are removed
SELECT 
  start_time AT TIME ZONE 'UTC' as start_time_utc,
  end_time AT TIME ZONE 'UTC' as end_time_utc,
  COUNT(*) as count
FROM vehicle_trips
WHERE device_id = '13612333441'
GROUP BY start_time, end_time
HAVING COUNT(*) > 1;

-- Expected result: 0 rows (no duplicates)

-- STEP 4: Get final trip count after cleanup
SELECT 
  COUNT(*) as total_trips_after_cleanup,
  COUNT(DISTINCT (start_time, end_time)) as unique_trips,
  SUM(distance_km) as total_distance_km
FROM vehicle_trips
WHERE device_id = '13612333441';
