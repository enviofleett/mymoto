-- Check why device 358657105966092 is not being updated
-- Compare with working device 13612332543

-- 1. Check if both devices exist in vehicles table
SELECT 
  v.device_id,
  v.device_name,
  v.last_synced_at,
  EXTRACT(EPOCH FROM (NOW() - v.last_synced_at)) / 60 AS minutes_since_sync
FROM vehicles v
WHERE v.device_id IN ('358657105966092', '13612332543')
ORDER BY v.device_id;

-- 2. Check if device is online/offline status
SELECT 
  vp.device_id,
  v.device_name,
  vp.is_online,
  vp.gps_time,
  vp.cached_at,
  CASE 
    WHEN vp.is_online = false THEN '❌ Offline - GPS51 not reporting'
    WHEN EXTRACT(EPOCH FROM (NOW() - vp.gps_time)) / 60 > 10 THEN '⚠️ Stale GPS data (>10 min)'
    ELSE '✅ Online'
  END as status
FROM vehicle_positions vp
LEFT JOIN vehicles v ON v.device_id = vp.device_id
WHERE vp.device_id IN ('358657105966092', '13612332543')
ORDER BY vp.device_id;

-- 3. Check recent position history to see last time device reported
SELECT 
  device_id,
  gps_time,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_ago,
  COUNT(*) as history_count
FROM position_history
WHERE device_id = '358657105966092'
  AND gps_time > NOW() - INTERVAL '24 hours'
GROUP BY device_id, gps_time
ORDER BY gps_time DESC
LIMIT 5;

-- If no recent history, the device hasn't been reporting GPS data
