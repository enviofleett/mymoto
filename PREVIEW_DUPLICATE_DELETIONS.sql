-- ============================================
-- PREVIEW DUPLICATE TRIP DELETIONS (SAFE - READ ONLY)
-- Device: 358657105966092
-- This query shows which trips will be KEPT vs DELETED
-- ============================================

-- SAFE DELETE: Identify trips to DELETE (keep only the best one from each duplicate group)
-- This query shows which trips would be deleted - REVIEW BEFORE RUNNING DELETE
WITH ranked_duplicates AS (
  SELECT 
    t.id,
    t.device_id,
    t.start_time,
    t.end_time,
    t.created_at,
    t.start_latitude,
    t.start_longitude,
    t.end_latitude,
    t.end_longitude,
    t.distance_km,
    t.duration_seconds,
    t.avg_speed,
    t.max_speed,
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
  WHERE t.device_id = '358657105966092'
)
SELECT 
  id,
  device_id,
  start_time,
  end_time,
  created_at,
  duplicate_count,
  keep_rank,
  distance_km,
  duration_seconds,
  CASE 
    WHEN start_latitude != 0 AND start_longitude != 0 
     AND end_latitude != 0 AND end_longitude != 0 
     AND distance_km > 0 AND duration_seconds > 0
    THEN 'HIGH_QUALITY'
    WHEN start_latitude != 0 AND start_longitude != 0 
     AND end_latitude != 0 AND end_longitude != 0 
    THEN 'MEDIUM_QUALITY'
    WHEN distance_km > 0 OR duration_seconds > 0
    THEN 'LOW_QUALITY'
    ELSE 'POOR_QUALITY'
  END as quality,
  CASE 
    WHEN keep_rank = 1 THEN '✅ KEEP (best quality)'
    ELSE '❌ DELETE (duplicate)'
  END as action
FROM ranked_duplicates
WHERE duplicate_count > 1
ORDER BY start_time DESC, keep_rank ASC;

-- Summary: Count how many will be kept vs deleted
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
    ) as keep_rank,
    COUNT(*) OVER (PARTITION BY t.device_id, t.start_time, t.end_time) as duplicate_count
  FROM vehicle_trips t
  WHERE t.device_id = '358657105966092'
)
SELECT 
  COUNT(*) FILTER (WHERE keep_rank = 1) as trips_to_keep,
  COUNT(*) FILTER (WHERE keep_rank > 1) as trips_to_delete,
  COUNT(*) as total_duplicate_trips,
  COUNT(DISTINCT (device_id, start_time, end_time)) as unique_trip_groups
FROM ranked_duplicates
WHERE duplicate_count > 1;
