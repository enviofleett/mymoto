-- Check today's mileage for device 358657105966092 from GPS51 data
-- This uses the new GPS51 direct data sync (vehicle_trips table)

-- Option 1: Direct query from vehicle_trips (GPS51 source of truth)
SELECT 
  COUNT(*) as trip_count_today,
  COALESCE(SUM(distance_km), 0) as total_distance_km,
  COALESCE(ROUND(SUM(distance_km)::numeric, 2), 0) as total_distance_km_rounded,
  COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
  COALESCE(ROUND(SUM(duration_seconds) / 60.0, 1), 0) as total_duration_minutes,
  MIN(start_time) as first_trip_start,
  MAX(end_time) as last_trip_end,
  ROUND(AVG(avg_speed)::numeric, 1) as avg_speed_kmh,
  ROUND(MAX(max_speed)::numeric, 1) as max_speed_kmh
FROM vehicle_trips
WHERE device_id = '358657105966092'
  AND start_time >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos')
  AND start_time < (date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') + INTERVAL '1 day')
  AND end_time IS NOT NULL; -- Only completed trips

-- Option 2: Using vehicle_daily_stats view (aggregated GPS51 data)
SELECT 
  trip_date,
  total_distance_km,
  trip_count,
  total_duration_minutes
FROM vehicle_daily_stats
WHERE device_id = '358657105966092'
  AND trip_date = CURRENT_DATE
ORDER BY trip_date DESC;

-- Option 3: Using RPC function (get_vehicle_mileage_stats)
SELECT * FROM get_vehicle_mileage_stats('358657105966092');

-- Option 4: Detailed trip breakdown for today
SELECT 
  id,
  start_time AT TIME ZONE 'Africa/Lagos' as start_time_lagos,
  end_time AT TIME ZONE 'Africa/Lagos' as end_time_lagos,
  ROUND(COALESCE(distance_km, 0)::numeric, 2) AS distance_km,
  ROUND(COALESCE(max_speed, 0)::numeric, 1) AS max_speed_kmh,
  ROUND(COALESCE(avg_speed, 0)::numeric, 1) AS avg_speed_kmh,
  COALESCE(duration_seconds, 0) AS duration_seconds,
  ROUND(COALESCE(duration_seconds, 0) / 60.0, 1) AS duration_minutes
FROM vehicle_trips
WHERE device_id = '358657105966092'
  AND start_time >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos')
  AND start_time < (date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') + INTERVAL '1 day')
ORDER BY start_time DESC;
