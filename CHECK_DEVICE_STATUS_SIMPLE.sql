-- Simple check for device status (fixed - no device_name in vehicle_positions)

-- Check both devices status
SELECT 
  vp.device_id,
  v.device_name,
  vp.is_online,
  vp.gps_time,
  vp.cached_at,
  EXTRACT(EPOCH FROM (NOW() - vp.cached_at)) / 60 AS minutes_since_cached,
  CASE 
    WHEN vp.is_online = false THEN '❌ Offline - GPS51 not reporting'
    WHEN EXTRACT(EPOCH FROM (NOW() - vp.gps_time)) / 60 > 10 THEN '⚠️ Stale GPS data'
    ELSE '✅ Online'
  END as status
FROM vehicle_positions vp
LEFT JOIN vehicles v ON v.device_id = vp.device_id
WHERE vp.device_id IN ('358657105966092', '13612332543')
ORDER BY vp.device_id;

-- Check if devices exist in vehicles table
SELECT 
  device_id,
  device_name,
  last_synced_at
FROM vehicles
WHERE device_id IN ('358657105966092', '13612332543')
ORDER BY device_id;
