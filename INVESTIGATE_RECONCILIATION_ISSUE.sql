-- Investigation: Why Reconciliation Fixed 0 Trips
-- Run these in Supabase SQL Editor

-- =====================================================
-- 1. Check trips with missing coordinates
-- =====================================================
SELECT 
  COUNT(*) as trips_missing_coords,
  COUNT(*) FILTER (WHERE start_latitude = 0 OR start_longitude = 0) as missing_start_coords,
  COUNT(*) FILTER (WHERE end_latitude = 0 OR end_longitude = 0) as missing_end_coords,
  COUNT(*) FILTER (WHERE start_latitude = 0 AND end_latitude = 0) as missing_both_coords
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND (start_latitude = 0 OR start_longitude = 0 OR end_latitude = 0 OR end_longitude = 0);

-- =====================================================
-- 2. Sample trips with missing coordinates
-- =====================================================
SELECT 
  id,
  start_time,
  end_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  CASE 
    WHEN start_latitude = 0 OR start_longitude = 0 THEN 'Missing start'
    WHEN end_latitude = 0 OR end_longitude = 0 THEN 'Missing end'
    ELSE 'Both missing'
  END as missing_type
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND (start_latitude = 0 OR start_longitude = 0 OR end_latitude = 0 OR end_longitude = 0)
ORDER BY start_time DESC
LIMIT 10;

-- =====================================================
-- 3. Check position_history coverage for trip times
-- =====================================================
-- Check if position_history has data near trip times
WITH missing_trips AS (
  SELECT 
    id,
    start_time,
    end_time,
    start_latitude,
    end_latitude
  FROM vehicle_trips
  WHERE device_id = '358657106048551'
    AND (start_latitude = 0 OR end_latitude = 0)
  LIMIT 5
)
SELECT 
  mt.id as trip_id,
  mt.start_time,
  mt.end_time,
  COUNT(ph.id) FILTER (
    WHERE ph.gps_time >= mt.start_time - INTERVAL '15 minutes'
      AND ph.gps_time <= mt.start_time + INTERVAL '15 minutes'
  ) as positions_near_start,
  COUNT(ph.id) FILTER (
    WHERE ph.gps_time >= mt.end_time - INTERVAL '15 minutes'
      AND ph.gps_time <= mt.end_time + INTERVAL '15 minutes'
  ) as positions_near_end
FROM missing_trips mt
LEFT JOIN position_history ph ON ph.device_id = '358657106048551'
GROUP BY mt.id, mt.start_time, mt.end_time;

-- =====================================================
-- 4. Overall position_history coverage
-- =====================================================
SELECT 
  COUNT(*) as total_positions,
  MIN(gps_time) as earliest_position,
  MAX(gps_time) as latest_position,
  COUNT(*) FILTER (WHERE gps_time >= '2025-12-22' AND gps_time <= '2026-01-21') as positions_in_range
FROM position_history
WHERE device_id = '358657106048551';
