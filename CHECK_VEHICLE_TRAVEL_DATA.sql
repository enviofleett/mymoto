-- Check Travel Data for Vehicle: 13612332432
-- Comprehensive queries to analyze vehicle travel patterns, trips, and activity

-- ============================================================================
-- 1. Vehicle Basic Information
-- ============================================================================
SELECT 
  device_id,
  device_name,
  device_type,
  group_name,
  last_synced_at,
  created_at
FROM vehicles
WHERE device_id = '13612332432';

-- ============================================================================
-- 2. Current Position & Status
-- ============================================================================
SELECT 
  device_id,
  latitude,
  longitude,
  speed,
  heading,
  battery_percent,
  ignition_on,
  is_online,
  is_overspeeding,
  total_mileage,
  gps_time,
  cached_at,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 as minutes_since_last_update
FROM vehicle_positions
WHERE device_id = '13612332432';

-- ============================================================================
-- 3. Recent Trips (Last 30 Days)
-- ============================================================================
SELECT 
  id,
  device_id,
  start_time,
  end_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  distance_km,
  max_speed,
  avg_speed,
  duration_seconds,
  EXTRACT(EPOCH FROM (end_time - start_time)) / 60 as duration_minutes,
  created_at
FROM vehicle_trips
WHERE device_id = '13612332432'
  AND start_time >= NOW() - INTERVAL '30 days'
ORDER BY start_time DESC
LIMIT 50;

-- ============================================================================
-- 4. Trip Statistics Summary (Last 30 Days)
-- ============================================================================
SELECT 
  COUNT(*) as total_trips,
  SUM(distance_km) as total_distance_km,
  AVG(distance_km) as avg_distance_km,
  MAX(distance_km) as max_distance_km,
  SUM(duration_seconds) / 3600.0 as total_hours_driven,
  AVG(duration_seconds) / 60.0 as avg_duration_minutes,
  MAX(max_speed) as max_speed_kmh,
  AVG(avg_speed) as avg_speed_kmh,
  MIN(start_time) as first_trip,
  MAX(end_time) as last_trip
FROM vehicle_trips
WHERE device_id = '13612332432'
  AND start_time >= NOW() - INTERVAL '30 days';

-- ============================================================================
-- 5. Recent Position History (Last 24 Hours)
-- ============================================================================
SELECT 
  id,
  device_id,
  latitude,
  longitude,
  speed,
  heading,
  battery_percent,
  ignition_on,
  gps_time,
  recorded_at,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 as minutes_ago
FROM position_history
WHERE device_id = '13612332432'
  AND gps_time >= NOW() - INTERVAL '24 hours'
ORDER BY gps_time DESC
LIMIT 100;

-- ============================================================================
-- 6. Daily Travel Summary (Last 7 Days)
-- ============================================================================
SELECT 
  DATE(start_time AT TIME ZONE 'Africa/Lagos') as travel_date,
  COUNT(*) as trips_count,
  SUM(distance_km) as total_distance_km,
  SUM(duration_seconds) / 3600.0 as total_hours,
  AVG(avg_speed) as avg_speed_kmh,
  MAX(max_speed) as max_speed_kmh
FROM vehicle_trips
WHERE device_id = '13612332432'
  AND start_time >= NOW() - INTERVAL '7 days'
GROUP BY DATE(start_time AT TIME ZONE 'Africa/Lagos')
ORDER BY travel_date DESC;

-- ============================================================================
-- 7. Recent Activity Timeline (Last 24 Hours)
-- ============================================================================
SELECT 
  'position' as source,
  gps_time as event_time,
  latitude,
  longitude,
  speed,
  ignition_on,
  battery_percent,
  'GPS Update' as event_type
FROM position_history
WHERE device_id = '13612332432'
  AND gps_time >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'trip_start' as source,
  start_time as event_time,
  start_latitude as latitude,
  start_longitude as longitude,
  NULL as speed,
  true as ignition_on,
  NULL as battery_percent,
  'Trip Started' as event_type
FROM vehicle_trips
WHERE device_id = '13612332432'
  AND start_time >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'trip_end' as source,
  end_time as event_time,
  end_latitude as latitude,
  end_longitude as longitude,
  NULL as speed,
  false as ignition_on,
  NULL as battery_percent,
  'Trip Ended' as event_type
FROM vehicle_trips
WHERE device_id = '13612332432'
  AND end_time >= NOW() - INTERVAL '24 hours'

ORDER BY event_time DESC
LIMIT 200;

-- ============================================================================
-- 8. Speed Analysis (Last 7 Days)
-- ============================================================================
SELECT 
  CASE 
    WHEN speed = 0 THEN 'Stopped'
    WHEN speed < 20 THEN 'Slow (0-20 km/h)'
    WHEN speed < 60 THEN 'City (20-60 km/h)'
    WHEN speed < 100 THEN 'Highway (60-100 km/h)'
    ELSE 'Very Fast (>100 km/h)'
  END as speed_category,
  COUNT(*) as position_count,
  AVG(speed) as avg_speed,
  MAX(speed) as max_speed,
  SUM(CASE WHEN speed > 100 THEN 1 ELSE 0 END) as overspeeding_count
FROM position_history
WHERE device_id = '13612332432'
  AND gps_time >= NOW() - INTERVAL '7 days'
  AND speed IS NOT NULL
GROUP BY speed_category
ORDER BY avg_speed DESC;

-- ============================================================================
-- 9. Ignition Patterns (Last 7 Days)
-- ============================================================================
SELECT 
  DATE(gps_time AT TIME ZONE 'Africa/Lagos') as date,
  COUNT(*) FILTER (WHERE ignition_on = true) as ignition_on_count,
  COUNT(*) FILTER (WHERE ignition_on = false) as ignition_off_count,
  MIN(gps_time) FILTER (WHERE ignition_on = true) as first_ignition_on,
  MAX(gps_time) FILTER (WHERE ignition_on = true) as last_ignition_on,
  COUNT(DISTINCT DATE(gps_time AT TIME ZONE 'Africa/Lagos')) as active_days
FROM position_history
WHERE device_id = '13612332432'
  AND gps_time >= NOW() - INTERVAL '7 days'
GROUP BY DATE(gps_time AT TIME ZONE 'Africa/Lagos')
ORDER BY date DESC;

-- ============================================================================
-- 10. Battery Status Over Time (Last 7 Days)
-- ============================================================================
SELECT 
  DATE(gps_time AT TIME ZONE 'Africa/Lagos') as date,
  MIN(battery_percent) as min_battery,
  MAX(battery_percent) as max_battery,
  AVG(battery_percent) as avg_battery,
  COUNT(*) FILTER (WHERE battery_percent < 20) as low_battery_count,
  COUNT(*) FILTER (WHERE battery_percent < 10) as critical_battery_count
FROM position_history
WHERE device_id = '13612332432'
  AND gps_time >= NOW() - INTERVAL '7 days'
  AND battery_percent IS NOT NULL
GROUP BY DATE(gps_time AT TIME ZONE 'Africa/Lagos')
ORDER BY date DESC;

-- ============================================================================
-- 11. Longest Trips (All Time)
-- ============================================================================
SELECT 
  id,
  start_time,
  end_time,
  distance_km,
  duration_seconds / 60.0 as duration_minutes,
  avg_speed,
  max_speed,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude
FROM vehicle_trips
WHERE device_id = '13612332432'
ORDER BY distance_km DESC
LIMIT 10;

-- ============================================================================
-- 12. Most Recent Trip Details
-- ============================================================================
SELECT 
  t.*,
  EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 60 as duration_minutes,
  v.device_name
FROM vehicle_trips t
LEFT JOIN vehicles v ON t.device_id = v.device_id
WHERE t.device_id = '13612332432'
ORDER BY t.start_time DESC
LIMIT 1;

-- ============================================================================
-- 13. Data Quality Check
-- ============================================================================
SELECT 
  'position_history' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE gps_time >= NOW() - INTERVAL '24 hours') as last_24h,
  COUNT(*) FILTER (WHERE gps_time >= NOW() - INTERVAL '7 days') as last_7d,
  MIN(gps_time) as earliest_record,
  MAX(gps_time) as latest_record,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coords,
  COUNT(*) FILTER (WHERE gps_time > NOW() + INTERVAL '1 day') as invalid_future_dates
FROM position_history
WHERE device_id = '13612332432'

UNION ALL

SELECT 
  'vehicle_trips' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE start_time >= NOW() - INTERVAL '24 hours') as last_24h,
  COUNT(*) FILTER (WHERE start_time >= NOW() - INTERVAL '7 days') as last_7d,
  MIN(start_time) as earliest_record,
  MAX(end_time) as latest_record,
  COUNT(*) FILTER (WHERE distance_km = 0) as zero_distance_trips,
  NULL as invalid_future_dates
FROM vehicle_trips
WHERE device_id = '13612332432';

-- ============================================================================
-- 14. Quick Status Summary
-- ============================================================================
SELECT 
  v.device_id,
  v.device_name,
  vp.is_online,
  vp.ignition_on,
  vp.speed,
  vp.battery_percent,
  vp.gps_time as last_gps_update,
  vp.cached_at as last_sync,
  EXTRACT(EPOCH FROM (NOW() - vp.cached_at)) / 60 as minutes_since_sync,
  (SELECT COUNT(*) FROM vehicle_trips WHERE device_id = v.device_id AND start_time >= NOW() - INTERVAL '7 days') as trips_last_7d,
  (SELECT SUM(distance_km) FROM vehicle_trips WHERE device_id = v.device_id AND start_time >= NOW() - INTERVAL '7 days') as distance_last_7d_km
FROM vehicles v
LEFT JOIN vehicle_positions vp ON v.device_id = vp.device_id
WHERE v.device_id = '13612332432';
