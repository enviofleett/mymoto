-- Quick Check for Vehicle: 13612332432
-- Fast queries for immediate status check

-- ============================================================================
-- QUICK STATUS (Run this first)
-- ============================================================================
SELECT 
  v.device_id,
  v.device_name,
  vp.is_online,
  vp.ignition_on,
  vp.speed,
  vp.battery_percent,
  vp.latitude,
  vp.longitude,
  vp.gps_time as last_gps_update,
  EXTRACT(EPOCH FROM (NOW() - vp.cached_at)) / 60 as minutes_since_sync,
  (SELECT COUNT(*) FROM vehicle_trips 
   WHERE device_id = v.device_id 
   AND start_time >= NOW() - INTERVAL '7 days') as trips_last_7d
FROM vehicles v
LEFT JOIN vehicle_positions vp ON v.device_id = vp.device_id
WHERE v.device_id = '13612332432';

-- ============================================================================
-- RECENT TRIPS (Last 7 Days)
-- ============================================================================
SELECT 
  start_time,
  end_time,
  distance_km,
  duration_seconds / 60.0 as duration_minutes,
  avg_speed,
  max_speed
FROM vehicle_trips
WHERE device_id = '13612332432'
  AND start_time >= NOW() - INTERVAL '7 days'
ORDER BY start_time DESC
LIMIT 20;

-- ============================================================================
-- TODAY'S ACTIVITY
-- ============================================================================
SELECT 
  COUNT(*) as gps_updates_today,
  COUNT(*) FILTER (WHERE ignition_on = true) as ignition_on_count,
  MAX(speed) as max_speed_today,
  AVG(battery_percent) as avg_battery_today
FROM position_history
WHERE device_id = '13612332432'
  AND DATE(gps_time AT TIME ZONE 'Africa/Lagos') = CURRENT_DATE;
