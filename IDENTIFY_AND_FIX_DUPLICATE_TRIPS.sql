-- ============================================
-- IDENTIFY AND FIX DUPLICATE TRIPS
-- Device: 358657105966092 (and all devices)
-- ============================================

-- 1. Identify exact duplicate trips (same device_id, start_time, end_time)
-- This query finds trips that are exact duplicates based on timestamps
SELECT 
  device_id,
  start_time,
  end_time,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at DESC) as trip_ids,
  array_agg(created_at ORDER BY created_at DESC) as created_dates,
  -- Show which trip has the best data quality
  array_agg(
    CASE 
      WHEN start_latitude != 0 AND start_longitude != 0 
       AND end_latitude != 0 AND end_longitude != 0 
       AND distance_km > 0 
      THEN 'HIGH_QUALITY'
      WHEN start_latitude != 0 AND start_longitude != 0 
       AND end_latitude != 0 AND end_longitude != 0 
      THEN 'MEDIUM_QUALITY'
      WHEN distance_km > 0 
      THEN 'LOW_QUALITY'
      ELSE 'POOR_QUALITY'
    END
    ORDER BY created_at DESC
  ) as quality_scores
FROM vehicle_trips
WHERE device_id = '358657105966092'
GROUP BY device_id, start_time, end_time
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, start_time DESC;

-- 2. Get detailed view of duplicate trips for device 358657105966092
-- Shows all duplicate trips with their data quality metrics
WITH duplicates AS (
  SELECT 
    device_id,
    start_time,
    end_time,
    COUNT(*) as duplicate_count
  FROM vehicle_trips
  WHERE device_id = '358657105966092'
  GROUP BY device_id, start_time, end_time
  HAVING COUNT(*) > 1
)
SELECT 
  t.id,
  t.device_id,
  t.start_time,
  t.end_time,
  t.start_latitude,
  t.start_longitude,
  t.end_latitude,
  t.end_longitude,
  t.distance_km,
  t.duration_seconds,
  t.avg_speed,
  t.max_speed,
  t.created_at,
  d.duplicate_count,
  -- Calculate quality score
  CASE 
    WHEN t.start_latitude != 0 AND t.start_longitude != 0 
     AND t.end_latitude != 0 AND t.end_longitude != 0 
     AND t.distance_km > 0 AND t.duration_seconds > 0
    THEN 'HIGH_QUALITY'
    WHEN t.start_latitude != 0 AND t.start_longitude != 0 
     AND t.end_latitude != 0 AND t.end_longitude != 0 
    THEN 'MEDIUM_QUALITY'
    WHEN t.distance_km > 0 OR t.duration_seconds > 0
    THEN 'LOW_QUALITY'
    ELSE 'POOR_QUALITY'
  END as quality,
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
  ) as keep_rank
FROM vehicle_trips t
INNER JOIN duplicates d 
  ON t.device_id = d.device_id 
  AND t.start_time = d.start_time 
  AND t.end_time = d.end_time
WHERE t.device_id = '358657105966092'
ORDER BY t.start_time DESC, keep_rank ASC;

-- 3. SAFE DELETE: Identify trips to DELETE (keep only the best one from each duplicate group)
-- This query shows which trips would be deleted - REVIEW BEFORE RUNNING DELETE
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
  CASE 
    WHEN keep_rank = 1 THEN 'KEEP (best quality)'
    ELSE 'DELETE (duplicate)'
  END as action
FROM ranked_duplicates
WHERE duplicate_count > 1
ORDER BY start_time DESC, keep_rank ASC;

-- 4. ACTUAL DELETE (UNCOMMENT TO RUN - REVIEW QUERY 3 FIRST!)
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
  WHERE t.device_id = '358657105966092'
)
DELETE FROM vehicle_trips
WHERE id IN (
  SELECT id FROM ranked_duplicates WHERE keep_rank > 1
)
RETURNING id, device_id, start_time, end_time;
*/

-- 5. Summary: Count duplicates by device
SELECT 
  device_id,
  COUNT(DISTINCT (device_id, start_time, end_time)) as unique_trip_combinations,
  COUNT(*) as total_trips,
  COUNT(*) - COUNT(DISTINCT (device_id, start_time, end_time)) as duplicate_trips_to_remove
FROM vehicle_trips
WHERE device_id = '358657105966092'
GROUP BY device_id;
