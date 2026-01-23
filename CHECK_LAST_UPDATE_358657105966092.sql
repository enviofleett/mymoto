-- Check last update time for device 358657105966092
-- This will help debug the timezone issue

SELECT 
  device_id,
  gps_time,
  gps_time AT TIME ZONE 'UTC' AS gps_time_utc,
  gps_time AT TIME ZONE 'Africa/Lagos' AS gps_time_lagos,
  cached_at,
  cached_at AT TIME ZONE 'UTC' AS cached_at_utc,
  cached_at AT TIME ZONE 'Africa/Lagos' AS cached_at_lagos,
  is_online,
  speed,
  latitude,
  longitude,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_ago,
  NOW() AS current_time_utc,
  NOW() AT TIME ZONE 'Africa/Lagos' AS current_time_lagos
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- Also check the most recent position history entry
SELECT 
  device_id,
  gps_time,
  gps_time AT TIME ZONE 'UTC' AS gps_time_utc,
  gps_time AT TIME ZONE 'Africa/Lagos' AS gps_time_lagos,
  recorded_at,
  recorded_at AT TIME ZONE 'UTC' AS recorded_at_utc,
  recorded_at AT TIME ZONE 'Africa/Lagos' AS recorded_at_lagos,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_ago
FROM position_history
WHERE device_id = '358657105966092'
ORDER BY gps_time DESC
LIMIT 1;
