-- ============================================================================
-- Trigger Realtime Update for Device 358657105966092
-- ============================================================================
-- Run this to test realtime location updates
-- Each execution moves the marker slightly northeast
-- ============================================================================

-- Current position: Lat 9.067384, Lon 7.431522
-- After update: Lat 9.067484, Lon 7.431622 (moved ~11 meters northeast)

UPDATE vehicle_positions 
SET 
  latitude = latitude + 0.0001,
  longitude = longitude + 0.0001,
  cached_at = NOW()
WHERE device_id = '358657105966092';

-- ============================================================================
-- Verify the update
-- ============================================================================
SELECT 
  device_id,
  latitude,
  longitude,
  cached_at,
  NOW() - cached_at as age
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- Expected: cached_at should be NOW(), age should be < 1 second
-- ============================================================================

-- ============================================================================
-- Run multiple times to test continuous updates
-- Each run moves marker further northeast
-- ============================================================================
