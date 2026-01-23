-- ============================================
-- CLEANUP ALL DUPLICATE TRIPS - RUN THIS FIRST
-- This will delete all duplicate trips, keeping only the best one from each group
-- ============================================

-- DELETE all duplicate trips (keeps best quality one from each duplicate group)
WITH ranked_duplicates AS (
  SELECT 
    t.id,
    t.device_id,
    t.start_time,
    t.end_time,
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
RETURNING id, device_id, start_time, end_time;

-- After running the DELETE above, verify no duplicates remain:
SELECT 
  device_id,
  COUNT(DISTINCT (device_id, start_time, end_time)) as unique_trip_combinations,
  COUNT(*) as total_trips,
  COUNT(*) - COUNT(DISTINCT (device_id, start_time, end_time)) as remaining_duplicates
FROM vehicle_trips
GROUP BY device_id
HAVING COUNT(*) - COUNT(DISTINCT (device_id, start_time, end_time)) > 0
ORDER BY remaining_duplicates DESC;

-- If the query above returns NO ROWS, you can now create the unique index:
-- Run PREVENT_DUPLICATE_TRIPS.sql
