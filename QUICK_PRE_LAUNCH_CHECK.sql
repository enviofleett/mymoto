-- ============================================================================
-- Quick Pre-Launch Health Check
-- ============================================================================
-- Run this before going live to verify everything is working
-- ============================================================================

-- 1. Check timezone
SHOW timezone;
-- Expected: Africa/Lagos

-- 2. Check recent GPS data sync (Last 1 hour only to avoid timeout)
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(*) FILTER (WHERE last_synced_at >= NOW() - INTERVAL '1 hour') as synced_last_hour,
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  MAX(last_synced_at) as most_recent_sync
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '1 hour' OR last_synced_at IS NULL;

-- 3. Check ignition confidence status
SELECT 
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence
FROM vehicle_positions
WHERE ignition_confidence IS NOT NULL
  AND last_synced_at >= NOW() - INTERVAL '1 day'
GROUP BY ignition_detection_method
ORDER BY count DESC;

-- 4. Check for any critical errors in recent syncs
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

-- 5. Verify position history is being recorded
SELECT 
  COUNT(*) as total_positions,
  COUNT(DISTINCT device_id) as unique_devices,
  MAX(recorded_at) as most_recent_record
FROM position_history
WHERE recorded_at >= NOW() - INTERVAL '1 day';

-- 6. Check for any obvious data issues (Recent records only to avoid timeout)
-- Run these separately:

-- Invalid coordinates (recent only)
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

-- Future timestamps (recent only)
SELECT 
  'Future timestamps (last hour)' as check_type,
  COUNT(*) as issue_count
FROM vehicle_positions
WHERE (last_synced_at >= NOW() - INTERVAL '1 hour' OR last_synced_at IS NULL)
  AND gps_time > NOW() + INTERVAL '1 day';
