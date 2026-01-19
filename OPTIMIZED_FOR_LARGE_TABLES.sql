-- Optimized Queries for Large Tables (32M+ rows)
-- These queries are designed to work with massive position_history table

-- ============================================================================
-- 1. Check Recent Data - Uses index, very fast
-- ============================================================================
-- This uses the idx_position_history_gps_time index we created
SELECT 
  COUNT(*) as recent_positions,
  MAX(gps_time) as latest_record
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour';

-- ============================================================================
-- 2. Check Confidence Data - Sample only (last 1 hour)
-- ============================================================================
SELECT 
  COUNT(*) as with_confidence,
  COUNT(DISTINCT device_id) as unique_devices
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour'
  AND ignition_confidence IS NOT NULL;

-- ============================================================================
-- 3. Sample Recent Positions - Limited to 20 rows
-- ============================================================================
SELECT 
  device_id,
  gps_time,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  speed
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour'
ORDER BY gps_time DESC
LIMIT 20;

-- ============================================================================
-- 4. Detection Method Distribution - Last 1 hour only
-- ============================================================================
SELECT 
  ignition_detection_method,
  COUNT(*) as count
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour'
  AND ignition_detection_method IS NOT NULL
GROUP BY ignition_detection_method
ORDER BY count DESC
LIMIT 10;

-- ============================================================================
-- 5. Vehicle Positions - Current state (small table, fast)
-- ============================================================================
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(ignition_confidence) as with_confidence,
  MAX(gps_time) as latest_position
FROM vehicle_positions;

-- ============================================================================
-- 6. ACC State History - Check if empty (expected if no ignition changes)
-- ============================================================================
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT device_id) as unique_devices
FROM acc_state_history;
