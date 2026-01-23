-- ============================================================================
-- Manual Test: Trigger Location Update for Realtime Testing
-- ============================================================================
-- This script manually updates vehicle_positions to test realtime updates
-- Replace [DEVICE_ID] with actual device ID (e.g., 358657105966092)
-- ============================================================================

-- Option 1: Small movement (for testing)
UPDATE vehicle_positions 
SET 
  latitude = latitude + 0.0001,
  longitude = longitude + 0.0001,
  cached_at = NOW(),
  gps_time = NOW()
WHERE device_id = '[DEVICE_ID]';

-- Option 2: Larger movement (for visual testing)
-- UPDATE vehicle_positions 
-- SET 
--   latitude = latitude + 0.01,
--   longitude = longitude + 0.01,
--   cached_at = NOW(),
--   gps_time = NOW()
-- WHERE device_id = '[DEVICE_ID]';

-- Option 3: Stationary update (timestamp only, no movement)
-- UPDATE vehicle_positions 
-- SET 
--   cached_at = NOW(),
--   gps_time = NOW()
-- WHERE device_id = '[DEVICE_ID]';

-- ============================================================================
-- After running this script:
-- 1. Check browser console for: [Realtime] Position update received
-- 2. Verify map marker moves (if lat/lon changed)
-- 3. Verify timestamp updates
-- ============================================================================
