-- Show invalid timestamps (limited to recent records)
-- Run these separately if needed

-- position_history future dates (limit 5)
SELECT 
  device_id,
  gps_time,
  recorded_at,
  EXTRACT(YEAR FROM gps_time) as year
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '24 hours'
ORDER BY gps_time DESC
LIMIT 5;

-- vehicle_positions future dates (limit 5)
SELECT 
  device_id,
  gps_time,
  cached_at,
  EXTRACT(YEAR FROM gps_time) as year
FROM vehicle_positions
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND cached_at >= NOW() - INTERVAL '24 hours'
ORDER BY gps_time DESC
LIMIT 5;
