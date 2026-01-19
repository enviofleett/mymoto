-- Check Data Availability in vehicle_positions
-- Run this to see if there's any data and when it was last updated

-- ============================================================================
-- 1. Overall vehicle_positions statistics (ULTRA-OPTIMIZED: Last 7 days only)
-- ============================================================================
-- Note: This query is optimized to avoid full table scans - uses 7 day window
SELECT 
  COUNT(*) as total_vehicles,
  MIN(gps_time) as earliest_position,
  MAX(gps_time) as latest_position,
  COUNT(CASE WHEN gps_time >= NOW() - INTERVAL '1 hour' THEN 1 END) as positions_last_hour,
  COUNT(CASE WHEN gps_time >= NOW() - INTERVAL '24 hours' THEN 1 END) as positions_last_24h,
  COUNT(CASE WHEN gps_time >= NOW() - INTERVAL '7 days' THEN 1 END) as positions_last_7d
FROM vehicle_positions
WHERE gps_time >= NOW() - INTERVAL '7 days'  -- Reduced to 7 days
  OR cached_at >= NOW() - INTERVAL '3 days';  -- Or cached in last 3 days

-- ============================================================================
-- 2. Check if confidence columns have any data (ULTRA-OPTIMIZED: Last 3 days)
-- ============================================================================
SELECT 
  COUNT(*) as total_positions,
  COUNT(ignition_confidence) as with_confidence,
  COUNT(ignition_detection_method) as with_method,
  COUNT(CASE WHEN ignition_confidence IS NOT NULL AND ignition_detection_method IS NOT NULL THEN 1 END) as with_both,
  ROUND(COUNT(ignition_confidence)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as confidence_percentage
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '3 days'  -- Reduced to 3 days
   OR gps_time >= NOW() - INTERVAL '3 days';  -- Or recent GPS data (3 days)

-- ============================================================================
-- 3. Recent positions with confidence data (if any)
-- ============================================================================
SELECT 
  device_id,
  gps_time,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  speed,
  battery_percent,
  cached_at
FROM vehicle_positions
WHERE ignition_confidence IS NOT NULL
ORDER BY gps_time DESC
LIMIT 20;

-- ============================================================================
-- 4. Check when positions were last cached (ULTRA-OPTIMIZED: Last 7 days)
-- ============================================================================
SELECT 
  COUNT(*) as total,
  MIN(cached_at) as oldest_cache,
  MAX(cached_at) as newest_cache,
  COUNT(CASE WHEN cached_at >= NOW() - INTERVAL '1 hour' THEN 1 END) as cached_last_hour,
  COUNT(CASE WHEN cached_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as cached_last_24h
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '7 days'  -- Only check last 7 days
   OR gps_time >= NOW() - INTERVAL '7 days';   -- Or recent GPS data

-- ============================================================================
-- 5. Compare position_history vs vehicle_positions (OPTIMIZED: Limited time window)
-- ============================================================================
-- Note: This query is split into two separate queries to avoid timeout
-- Run them separately if needed

-- Query 5a: position_history (last 6 hours - ULTRA-OPTIMIZED)
SELECT 
  'position_history' as table_name,
  COUNT(*) as total_records,
  COUNT(ignition_confidence) as with_confidence,
  MAX(gps_time) as latest_record
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '6 hours'  -- Reduced from 24h to 6h
LIMIT 50000;  -- Safety limit

-- Query 5b: vehicle_positions (last 6 hours) - Run separately
SELECT 
  'vehicle_positions' as table_name,
  COUNT(*) as total_records,
  COUNT(ignition_confidence) as with_confidence,
  MAX(gps_time) as latest_record
FROM vehicle_positions
WHERE gps_time >= NOW() - INTERVAL '6 hours'  -- Reduced from 24h to 6h
LIMIT 1000;  -- Safety limit

-- ============================================================================
-- 6. Check if edge function is writing confidence data
-- ============================================================================
-- This shows positions updated after the migration was applied
-- If confidence is still NULL, the edge function may not have run yet
SELECT 
  device_id,
  gps_time,
  cached_at,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  CASE 
    WHEN ignition_confidence IS NULL THEN '❌ No confidence data'
    ELSE '✅ Has confidence data'
  END as status
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '1 hour'
ORDER BY cached_at DESC
LIMIT 20;
