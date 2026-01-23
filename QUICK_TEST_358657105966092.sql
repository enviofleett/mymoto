-- ============================================================================
-- Quick Test Queries for Device 358657105966092
-- ============================================================================

-- 1. Check if device exists and current status
SELECT 
  device_id,
  latitude,
  longitude,
  speed,
  heading,
  battery_percent,
  ignition_on,
  is_online,
  gps_time,
  cached_at,
  NOW() - cached_at as time_since_update
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- 2. Check recent update history (if position_history exists)
-- SELECT 
--   device_id,
--   latitude,
--   longitude,
--   gps_time,
--   recorded_at
-- FROM position_history
-- WHERE device_id = '358657105966092'
-- ORDER BY gps_time DESC
-- LIMIT 10;

-- 3. Force an immediate update for testing realtime
-- Uncomment to trigger realtime update:
-- UPDATE vehicle_positions 
-- SET 
--   latitude = latitude + 0.0001,
--   longitude = longitude + 0.0001,
--   cached_at = NOW()
-- WHERE device_id = '358657105966092';

-- 4. Monitor update frequency
SELECT 
  device_id,
  COUNT(*) as update_count,
  MIN(cached_at) as first_update,
  MAX(cached_at) as last_update,
  MAX(cached_at) - MIN(cached_at) as update_span
FROM vehicle_positions
WHERE device_id = '358657105966092'
GROUP BY device_id;
