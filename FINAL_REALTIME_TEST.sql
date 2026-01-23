-- ============================================================================
-- Final Realtime Test - Device 358657105966092
-- ============================================================================
-- Run this while the vehicle profile page is OPEN in your browser
-- Watch the console and map for instant updates
-- ============================================================================

-- Step 1: Check current position
SELECT 
  device_id,
  latitude,
  longitude,
  speed,
  cached_at
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- Step 2: Trigger realtime update (run this while page is open)
-- Expected: Map marker moves instantly (< 1 second) without page refresh
UPDATE vehicle_positions 
SET 
  latitude = latitude + 0.0001,
  longitude = longitude + 0.0001,
  cached_at = NOW()
WHERE device_id = '358657105966092';

-- Step 3: Verify update occurred
SELECT 
  device_id,
  latitude,
  longitude,
  cached_at,
  NOW() - cached_at as age
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- Expected: cached_at should be NOW(), age < 1 second
-- Expected: Browser console should show "[Realtime] Position update received"
-- Expected: Map marker should move instantly

-- ============================================================================
-- Test Multiple Updates (run UPDATE query multiple times)
-- Each execution should trigger instant map update
-- ============================================================================
