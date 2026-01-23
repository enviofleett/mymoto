-- Compare two devices to see if issue is device-specific
-- This helps determine if the problem affects all devices or just one

-- Device 1: 358657105966092 (original)
SELECT 
  '358657105966092' as device_id,
  cached_at,
  gps_time,
  is_online,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_since_cached,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_since_gps
FROM vehicle_positions
WHERE device_id = '358657105966092'

UNION ALL

-- Device 2: 13612332543 (new)
SELECT 
  '13612332543' as device_id,
  cached_at,
  gps_time,
  is_online,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_since_cached,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_since_gps
FROM vehicle_positions
WHERE device_id = '13612332543';

-- Check if both devices exist in vehicles table
SELECT 
  device_id,
  device_name,
  last_synced_at
FROM vehicles
WHERE device_id IN ('358657105966092', '13612332543')
ORDER BY device_id;
