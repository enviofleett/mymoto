-- ============================================
-- DELETE DUPLICATE TRIPS
-- Device: 358657105966092
-- This will delete 104 duplicate trips, keeping only the best quality one from each group
-- ============================================
-- 
-- ⚠️ WARNING: This is a DESTRUCTIVE operation!
-- 
-- Before running this:
-- 1. Make sure you've reviewed PREVIEW_DUPLICATE_DELETIONS.sql
-- 2. Verify the preview shows the correct trips to delete
-- 3. Consider backing up your database first
-- 
-- This query will:
-- - Keep the trip with highest quality score (best GPS data, distance, duration)
-- - If quality is equal, keep the newest trip (by created_at)
-- - Delete all other duplicates
-- 
-- Expected result: 104 trips deleted, 37 trips kept (one per unique time combination)
-- ============================================

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
  WHERE t.device_id = '358657105966092'
)
DELETE FROM vehicle_trips
WHERE id IN (
  SELECT id FROM ranked_duplicates WHERE keep_rank > 1
)
RETURNING id, device_id, start_time, end_time, created_at;

-- After running, verify the deletion:
-- Run this to confirm only 37 unique trips remain:
SELECT 
  device_id,
  COUNT(DISTINCT (device_id, start_time, end_time)) as unique_trip_combinations,
  COUNT(*) as total_trips,
  COUNT(*) - COUNT(DISTINCT (device_id, start_time, end_time)) as remaining_duplicates
FROM vehicle_trips
WHERE device_id = '358657105966092'
GROUP BY device_id;
-- Expected: unique_trip_combinations = 37, total_trips = 37, remaining_duplicates = 0
