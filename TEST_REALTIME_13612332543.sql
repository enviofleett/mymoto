-- Test Realtime for device 13612332543
-- This will manually trigger a database update to test if Realtime works

-- Step 1: Check current position
SELECT 
  device_id,
  latitude,
  longitude,
  cached_at
FROM vehicle_positions
WHERE device_id = '13612332543';

-- Step 2: Manually update position to trigger Realtime event
UPDATE vehicle_positions
SET 
  latitude = COALESCE(latitude, 0) + 0.0001,
  longitude = COALESCE(longitude, 0) + 0.0001,
  cached_at = NOW(),
  gps_time = NOW()
WHERE device_id = '13612332543';

-- Step 3: Verify the update
SELECT 
  device_id,
  latitude,
  longitude,
  cached_at,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) AS seconds_ago
FROM vehicle_positions
WHERE device_id = '13612332543';

-- If you're viewing the vehicle profile page for 13612332543 in the browser,
-- you should immediately see in the console:
-- [Realtime] Position update received for 13612332543
-- [Realtime] ✅ Cache updated and invalidated
-- [VehicleLocationMap] Coordinates changed
-- And the map marker should move instantly!
