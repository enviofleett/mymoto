-- Check position data for device 13612332543
-- This will help determine if the issue is device-specific

SELECT 
  device_id,
  latitude,
  longitude,
  speed,
  gps_time,
  cached_at,
  is_online,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_since_cached,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_since_gps_time
FROM vehicle_positions
WHERE device_id = '13612332543';

-- Check if this device exists in vehicles table
SELECT 
  device_id,
  device_name,
  last_synced_at,
  EXTRACT(EPOCH FROM (NOW() - last_synced_at)) / 60 AS minutes_since_sync
FROM vehicles
WHERE device_id = '13612332543';

-- Check recent position history for this device
SELECT 
  device_id,
  gps_time,
  latitude,
  longitude,
  speed,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_ago
FROM position_history
WHERE device_id = '13612332543'
ORDER BY gps_time DESC
LIMIT 5;
