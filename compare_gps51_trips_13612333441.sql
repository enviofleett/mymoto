-- =====================================================
-- Compare GPS51 Trip Data with Database for Device 13612333441
-- =====================================================

-- 1. Check total trips in database for this device
SELECT 
  COUNT(*) as total_trips_in_db,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip,
  SUM(distance_km) as total_distance_km,
  AVG(distance_km) as avg_distance_km,
  SUM(duration_seconds) as total_duration_seconds,
  AVG(duration_seconds) as avg_duration_seconds
FROM vehicle_trips
WHERE device_id = '13612333441';

-- 2. Get trip details grouped by date
SELECT 
  DATE(start_time AT TIME ZONE 'UTC') as trip_date,
  COUNT(*) as trips_count,
  SUM(distance_km) as daily_distance_km,
  SUM(duration_seconds) as daily_duration_seconds,
  AVG(distance_km) as avg_trip_distance_km,
  AVG(duration_seconds) as avg_trip_duration_seconds,
  MIN(start_time) as first_trip_time,
  MAX(end_time) as last_trip_time
FROM vehicle_trips
WHERE device_id = '13612333441'
GROUP BY DATE(start_time AT TIME ZONE 'UTC')
ORDER BY trip_date DESC;

-- 3. Get all trips with details (recent first)
SELECT 
  id,
  device_id,
  start_time AT TIME ZONE 'UTC' as start_time_utc,
  end_time AT TIME ZONE 'UTC' as end_time_utc,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  distance_km,
  max_speed,
  avg_speed,
  duration_seconds,
  created_at AT TIME ZONE 'UTC' as created_at_utc
FROM vehicle_trips
WHERE device_id = '13612333441'
ORDER BY start_time DESC
LIMIT 100;

-- 4. Check for trips with invalid coordinates
SELECT 
  COUNT(*) as invalid_trips,
  SUM(CASE WHEN start_latitude = 0 OR start_longitude = 0 THEN 1 ELSE 0 END) as zero_start_coords,
  SUM(CASE WHEN end_latitude = 0 OR end_longitude = 0 THEN 1 ELSE 0 END) as zero_end_coords,
  SUM(CASE WHEN distance_km = 0 THEN 1 ELSE 0 END) as zero_distance_trips
FROM vehicle_trips
WHERE device_id = '13612333441';

-- 5. Check trip sync status for this device
SELECT 
  device_id,
  last_sync_at AT TIME ZONE 'UTC' as last_sync_at_utc,
  sync_status,
  trips_processed,
  trips_total,
  sync_progress_percent,
  current_operation,
  error_message,
  last_position_processed
FROM trip_sync_status
WHERE device_id = '13612333441';

-- 6. Count trips by hour of day (to see activity pattern)
SELECT 
  EXTRACT(HOUR FROM start_time AT TIME ZONE 'UTC') as hour_of_day,
  COUNT(*) as trips_count,
  SUM(distance_km) as total_distance_km,
  AVG(distance_km) as avg_distance_km
FROM vehicle_trips
WHERE device_id = '13612333441'
GROUP BY EXTRACT(HOUR FROM start_time AT TIME ZONE 'UTC')
ORDER BY hour_of_day;

-- 7. Find duplicate trips (same start/end time)
SELECT 
  start_time,
  end_time,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as trip_ids
FROM vehicle_trips
WHERE device_id = '13612333441'
GROUP BY start_time, end_time
HAVING COUNT(*) > 1
ORDER BY start_time DESC;

-- 8. Get trips with very short or very long durations (potential data issues)
SELECT 
  id,
  start_time AT TIME ZONE 'UTC' as start_time_utc,
  end_time AT TIME ZONE 'UTC' as end_time_utc,
  distance_km,
  duration_seconds,
  CASE 
    WHEN duration_seconds < 60 THEN 'Less than 1 minute'
    WHEN duration_seconds > 86400 THEN 'More than 24 hours'
    ELSE 'Normal'
  END as duration_category
FROM vehicle_trips
WHERE device_id = '13612333441'
  AND (duration_seconds < 60 OR duration_seconds > 86400)
ORDER BY start_time DESC;

-- 9. Get trips with very short distances (potential GPS issues)
SELECT 
  id,
  start_time AT TIME ZONE 'UTC' as start_time_utc,
  distance_km,
  duration_seconds,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude
FROM vehicle_trips
WHERE device_id = '13612333441'
  AND distance_km < 0.1  -- Less than 100 meters
ORDER BY start_time DESC;

-- 10. Summary statistics for today's trips
SELECT 
  COUNT(*) as trips_today,
  SUM(distance_km) as distance_today_km,
  SUM(duration_seconds) as duration_today_seconds,
  AVG(distance_km) as avg_distance_km,
  AVG(duration_seconds) as avg_duration_seconds,
  MAX(max_speed) as max_speed_today
FROM vehicle_trips
WHERE device_id = '13612333441'
  AND DATE(start_time AT TIME ZONE 'UTC') = CURRENT_DATE;
