-- Check current position and when it was last updated
-- This helps determine if GPS sync is running

SELECT 
  device_id,
  latitude,
  longitude,
  speed,
  gps_time,
  cached_at,
  is_online,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_since_update,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_since_gps_time
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- Check if there have been any recent updates (last hour)
SELECT 
  COUNT(*) as update_count,
  MAX(cached_at) as last_update,
  EXTRACT(EPOCH FROM (NOW() - MAX(cached_at))) / 60 AS minutes_ago
FROM vehicle_positions
WHERE device_id = '358657105966092'
  AND cached_at > NOW() - INTERVAL '1 hour';

-- If update_count is 0, the GPS sync job isn't running or vehicle is offline
