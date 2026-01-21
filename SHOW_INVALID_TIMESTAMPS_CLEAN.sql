-- Show sample invalid timestamps
SELECT 
  'position_history_future' as source,
  device_id,
  gps_time,
  recorded_at,
  EXTRACT(YEAR FROM gps_time) as year
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '7 days'
ORDER BY gps_time DESC
LIMIT 10;

SELECT 
  'vehicle_positions_future' as source,
  vp.device_id,
  v.device_name,
  vp.gps_time,
  vp.cached_at,
  EXTRACT(YEAR FROM vp.gps_time) as year
FROM vehicle_positions vp
LEFT JOIN vehicles v ON vp.device_id = v.device_id
WHERE vp.gps_time > NOW() + INTERVAL '1 day'
  AND vp.cached_at >= NOW() - INTERVAL '7 days'
ORDER BY vp.gps_time DESC
LIMIT 10;
