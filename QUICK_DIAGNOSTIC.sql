-- Quick Diagnostic Queries (Guaranteed Fast - Last 1 Hour Only)
-- These queries are optimized to run quickly even on large tables
-- Use these if the main diagnostic queries timeout

-- ============================================================================
-- 1. Quick Check: Recent vehicle positions (last 1 hour)
-- ============================================================================
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(ignition_confidence) as with_confidence,
  MAX(gps_time) as latest_position
FROM vehicle_positions
WHERE gps_time >= NOW() - INTERVAL '1 hour';

-- ============================================================================
-- 2. Quick Check: Recent position history (last 1 hour)
-- ============================================================================
SELECT 
  COUNT(*) as total_positions,
  COUNT(ignition_confidence) as with_confidence,
  COUNT(ignition_detection_method) as with_method,
  MAX(gps_time) as latest_record
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour';

-- ============================================================================
-- 3. Quick Sample: Recent positions with confidence (last 1 hour, 20 rows)
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
  AND ignition_confidence IS NOT NULL
ORDER BY gps_time DESC
LIMIT 20;

-- ============================================================================
-- 4. Quick Check: Detection method distribution (last 1 hour)
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
-- 5. Quick Check: ACC state history (last 1 hour)
-- ============================================================================
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT device_id) as unique_devices,
  MAX(begin_time) as latest_record
FROM acc_state_history
WHERE begin_time >= NOW() - INTERVAL '1 hour';
