-- ============================================
-- DELETE ALL DUPLICATE TRIPS (ALL DEVICES)
-- This will clean up duplicates across all devices before creating the unique index
-- ============================================
-- 
-- ⚠️ WARNING: This is a DESTRUCTIVE operation!
-- 
-- This query will:
-- - Find all duplicate trips across ALL devices
-- - Keep the trip with highest quality score (best GPS data, distance, duration)
-- - If quality is equal, keep the newest trip (by created_at)
-- - Delete all other duplicates
-- 
-- Run this BEFORE creating the unique index
-- ============================================

-- Step 1: Preview what will be deleted (SAFE - READ ONLY)
WITH ranked_duplicates AS (
  SELECT 
    t.id,
    t.device_id,
    t.start_time,
    t.end_time,
    t.created_at,
    -- Rank by quality and recency
    ROW_NUMBER() OVER (
      PARTITION BY t.device_id, t.start_time, t.end_time 
      ORDER BY 
        CASE 
          WHEN t.start_latitude != 0 AND t.start_longitude != 0 
           AND t.end_latitude != 0 AND t.end_longitude != 0 
           AND t.distance_km > 0 AND t.duration_seconds > 0
          THEN 4
          WHEN t.start_latitude != 0 AND t.start_longitude != 0 
           AND t.end_latitude != 0 AND t.end_longitude != 0 
          THEN 3
          WHEN t.distance_km > 0 OR t.duration_seconds > 0
          THEN 2
          ELSE 1
        END DESC,
        t.created_at DESC
    ) as keep_rank,
    COUNT(*) OVER (PARTITION BY t.device_id, t.start_time, t.end_time) as duplicate_count
  FROM vehicle_trips t
)
SELECT 
  device_id,
  COUNT(*) FILTER (WHERE keep_rank = 1) as trips_to_keep,
  COUNT(*) FILTER (WHERE keep_rank > 1) as trips_to_delete,
  COUNT(*) as total_duplicate_trips,
  COUNT(DISTINCT (device_id, start_time, end_time)) as unique_trip_groups
FROM ranked_duplicates
WHERE duplicate_count > 1
GROUP BY device_id
ORDER BY trips_to_delete DESC;

-- Step 2: Summary across all devices
WITH ranked_duplicates AS (
  SELECT 
    t.id,
    t.device_id,
    ROW_NUMBER() OVER (
      PARTITION BY t.device_id, t.start_time, t.end_time 
      ORDER BY 
        CASE 
          WHEN t.start_latitude != 0 AND t.start_longitude != 0 
           AND t.end_latitude != 0 AND t.end_longitude != 0 
           AND t.distance_km > 0 AND t.duration_seconds > 0
          THEN 4
          WHEN t.start_latitude != 0 AND t.start_longitude != 0 
           AND t.end_latitude != 0 AND t.end_longitude != 0 
          THEN 3
          WHEN t.distance_km > 0 OR t.duration_seconds > 0
          THEN 2
          ELSE 1
        END DESC,
        t.created_at DESC
    ) as keep_rank,
    COUNT(*) OVER (PARTITION BY t.device_id, t.start_time, t.end_time) as duplicate_count
  FROM vehicle_trips t
)
SELECT 
  COUNT(*) FILTER (WHERE keep_rank = 1) as total_trips_to_keep,
  COUNT(*) FILTER (WHERE keep_rank > 1) as total_trips_to_delete,
  COUNT(*) as total_duplicate_trips,
  COUNT(DISTINCT device_id) as devices_with_duplicates
FROM ranked_duplicates
WHERE duplicate_count > 1;

-- Step 3: ACTUAL DELETE (Uncomment to run - REVIEW STEPS 1 & 2 FIRST!)
-- This will delete duplicate trips, keeping only the best quality one from each group
/*
WITH ranked_duplicates AS (
  SELECT 
    t.id,
    ROW_NUMBER() OVER (
      PARTITION BY t.device_id, t.start_time, t.end_time 
      ORDER BY 
        CASE 
          WHEN t.start_latitude != 0 AND t.start_longitude != 0 
           AND t.end_latitude != 0 AND t.end_longitude != 0 
           AND t.distance_km > 0 AND t.duration_seconds > 0
          THEN 4
          WHEN t.start_latitude != 0 AND t.start_longitude != 0 
           AND t.end_latitude != 0 AND t.end_longitude != 0 
          THEN 3
          WHEN t.distance_km > 0 OR t.duration_seconds > 0
          THEN 2
          ELSE 1
        END DESC,
        t.created_at DESC
    ) as keep_rank
  FROM vehicle_trips t
)
DELETE FROM vehicle_trips
WHERE id IN (
  SELECT id FROM ranked_duplicates WHERE keep_rank > 1
)
RETURNING id, device_id, start_time, end_time, created_at;
*/

-- Step 4: After deletion, verify no duplicates remain
SELECT 
  device_id,
  COUNT(DISTINCT (device_id, start_time, end_time)) as unique_trip_combinations,
  COUNT(*) as total_trips,
  COUNT(*) - COUNT(DISTINCT (device_id, start_time, end_time)) as remaining_duplicates
FROM vehicle_trips
GROUP BY device_id
HAVING COUNT(*) - COUNT(DISTINCT (device_id, start_time, end_time)) > 0
ORDER BY remaining_duplicates DESC;

-- If Step 4 returns no rows, you can safely create the unique index!
