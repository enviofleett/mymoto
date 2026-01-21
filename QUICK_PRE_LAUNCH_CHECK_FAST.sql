-- ============================================================================
-- Quick Pre-Launch Health Check (Optimized - No Timeouts)
-- ============================================================================
-- Run these queries separately to avoid timeouts
-- ============================================================================

-- ============================================================================
-- CHECK 1: Timezone (Instant)
-- ============================================================================
SHOW timezone;
-- Expected: Africa/Lagos

-- ============================================================================
-- CHECK 2: Recent GPS Data Sync (Last 1 Hour Only)
-- ============================================================================
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(*) FILTER (WHERE last_synced_at >= NOW() - INTERVAL '1 hour') as synced_last_hour,
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  MAX(last_synced_at) as most_recent_sync
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '1 hour' OR last_synced_at IS NULL;

-- ============================================================================
-- CHECK 3: Ignition Confidence Status (Recent Records Only)
-- ============================================================================
SELECT 
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence
FROM vehicle_positions
WHERE ignition_confidence IS NOT NULL
  AND last_synced_at >= NOW() - INTERVAL '1 day'
GROUP BY ignition_detection_method
ORDER BY count DESC;

-- ============================================================================
-- CHECK 4: Recent Sync Sample (Limited to 20 records)
-- ============================================================================
SELECT 
  device_id,
  last_synced_at,
  ignition_on,
  ignition_confidence,
  is_online
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '1 hour'
ORDER BY last_synced_at DESC
LIMIT 20;

-- ============================================================================
-- CHECK 5: Position History (Last 1 Day Only)
-- ============================================================================
SELECT 
  COUNT(*) as total_positions,
  COUNT(DISTINCT device_id) as unique_devices,
  MAX(recorded_at) as most_recent_record
FROM position_history
WHERE recorded_at >= NOW() - INTERVAL '1 day';

-- ============================================================================
-- CHECK 6: Data Quality Issues (Recent Records Only)
-- ============================================================================
-- Invalid coordinates (recent records only)
SELECT 
  'Invalid coordinates (last hour)' as check_type,
  COUNT(*) as issue_count
FROM vehicle_positions
WHERE (last_synced_at >= NOW() - INTERVAL '1 hour' OR last_synced_at IS NULL)
  AND ((latitude = 0 AND longitude = 0) 
   OR latitude IS NULL 
   OR longitude IS NULL
   OR latitude < -90 OR latitude > 90
   OR longitude < -180 OR longitude > 180);

-- Future timestamps (recent records only)
SELECT 
  'Future timestamps (last hour)' as check_type,
  COUNT(*) as issue_count
FROM vehicle_positions
WHERE (last_synced_at >= NOW() - INTERVAL '1 hour' OR last_synced_at IS NULL)
  AND gps_time > NOW() + INTERVAL '1 day';
