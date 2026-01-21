-- Quick Investigation: Why Reconciliation Fixed 0 Trips
-- Run these queries in SQL Editor

-- =====================================================
-- 1. Check coordinate values (0 vs NULL)
-- =====================================================
SELECT 
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude = 0) as start_lat_is_zero,
  COUNT(*) FILTER (WHERE start_latitude IS NULL) as start_lat_is_null,
  COUNT(*) FILTER (WHERE end_latitude = 0) as end_lat_is_zero,
  COUNT(*) FILTER (WHERE end_latitude IS NULL) as end_lat_is_null,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND start_latitude IS NOT NULL) as start_lat_valid,
  COUNT(*) FILTER (WHERE end_latitude != 0 AND end_latitude IS NOT NULL) as end_lat_valid
FROM vehicle_trips
WHERE device_id = '358657106048551';

-- =====================================================
-- 2. Check position_history availability
-- =====================================================
SELECT 
  COUNT(*) as total_positions,
  MIN(gps_time) as earliest_position,
  MAX(gps_time) as latest_position
FROM position_history
WHERE device_id = '358657106048551';

-- =====================================================
-- 3. Sample trips with missing coordinates
-- =====================================================
SELECT 
  id,
  start_time,
  end_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND (start_latitude = 0 OR start_latitude IS NULL OR end_latitude = 0 OR end_latitude IS NULL)
ORDER BY start_time DESC
LIMIT 5;
