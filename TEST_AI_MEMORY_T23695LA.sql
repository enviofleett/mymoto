-- ============================================================================
-- AI Memory Test: Vehicle T-23695LA
-- ============================================================================
-- This script analyzes trip data to generate test questions for AI memory testing
-- Run each query to understand the vehicle's travel patterns
-- ============================================================================

-- 1. Get all trips for T-23695LA (last 30 days for memory testing)
SELECT 
  id,
  device_id,
  start_time,
  end_time,
  distance_km,
  duration_seconds,
  ROUND(duration_seconds / 60.0, 1) as duration_minutes,
  max_speed,
  ROUND(max_speed::numeric, 1) as max_speed_kmh,
  avg_speed,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  created_at
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days'
ORDER BY start_time DESC;

-- 2. Get trip statistics by date (to identify patterns)
SELECT 
  DATE(start_time) as trip_date,
  TO_CHAR(start_time, 'Day') as day_name,
  COUNT(*) as trip_count,
  ROUND(SUM(distance_km)::numeric, 2) as total_distance_km,
  ROUND(SUM(duration_seconds / 60.0)::numeric, 1) as total_duration_minutes,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  ROUND(MAX(max_speed)::numeric, 1) as max_speed_today,
  MIN(start_time)::time as first_trip_time,
  MAX(end_time)::time as last_trip_time
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days'
GROUP BY DATE(start_time), TO_CHAR(start_time, 'Day'), EXTRACT(DOW FROM start_time)
ORDER BY trip_date DESC;

-- 3. Get today's trips
SELECT 
  start_time,
  end_time,
  distance_km,
  duration_seconds,
  ROUND(duration_seconds / 60.0, 1) as duration_minutes,
  max_speed,
  ROUND(max_speed::numeric, 1) as max_speed_kmh,
  TO_CHAR(start_time, 'HH24:MI') as start_time_only,
  TO_CHAR(end_time, 'HH24:MI') as end_time_only
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND DATE(start_time) = CURRENT_DATE
ORDER BY start_time ASC;

-- 4. Get yesterday's trips
SELECT 
  start_time,
  end_time,
  distance_km,
  duration_seconds,
  ROUND(duration_seconds / 60.0, 1) as duration_minutes,
  max_speed,
  ROUND(max_speed::numeric, 1) as max_speed_kmh,
  TO_CHAR(start_time, 'HH24:MI') as start_time_only
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND DATE(start_time) = CURRENT_DATE - INTERVAL '1 day'
ORDER BY start_time ASC;

-- 5. Get longest trips (top 10)
SELECT 
  start_time,
  end_time,
  distance_km,
  duration_seconds,
  ROUND(duration_seconds / 60.0, 1) as duration_minutes,
  max_speed,
  ROUND(max_speed::numeric, 1) as max_speed_kmh,
  DATE(start_time) as trip_date
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days'
ORDER BY distance_km DESC
LIMIT 10;

-- 6. Get fastest trips (top 10)
SELECT 
  start_time,
  end_time,
  distance_km,
  max_speed,
  ROUND(max_speed::numeric, 1) as max_speed_kmh,
  duration_seconds,
  ROUND(duration_seconds / 60.0, 1) as duration_minutes,
  DATE(start_time) as trip_date
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days'
  AND max_speed IS NOT NULL
ORDER BY max_speed DESC
LIMIT 10;

-- 7. Get shortest trips (might be interesting)
SELECT 
  start_time,
  end_time,
  distance_km,
  duration_seconds,
  ROUND(duration_seconds / 60.0, 1) as duration_minutes,
  max_speed,
  ROUND(max_speed::numeric, 1) as max_speed_kmh,
  DATE(start_time) as trip_date
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days'
ORDER BY distance_km ASC
LIMIT 10;

-- 8. Get trips by time of day (to identify patterns)
SELECT 
  EXTRACT(HOUR FROM start_time) as hour_of_day,
  COUNT(*) as trip_count,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  ROUND(SUM(distance_km)::numeric, 2) as total_distance_km
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days'
GROUP BY EXTRACT(HOUR FROM start_time)
ORDER BY hour_of_day;

-- 9. Get trips by day of week
SELECT 
  TO_CHAR(start_time, 'Day') as day_of_week,
  EXTRACT(DOW FROM start_time) as day_number,
  COUNT(*) as trip_count,
  ROUND(SUM(distance_km)::numeric, 2) as total_distance_km,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days'
GROUP BY TO_CHAR(start_time, 'Day'), EXTRACT(DOW FROM start_time)
ORDER BY day_number;

-- 10. Get trips with valid location data
SELECT 
  start_time,
  end_time,
  distance_km,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  CASE 
    WHEN start_latitude != 0 AND start_longitude != 0 
      AND end_latitude != 0 AND end_longitude != 0 
    THEN 'Has locations'
    ELSE 'Missing locations'
  END as location_status
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days'
ORDER BY start_time DESC
LIMIT 20;

-- 11. Get weekly summary (last 4 weeks)
SELECT 
  DATE_TRUNC('week', start_time) as week_start,
  COUNT(*) as trip_count,
  ROUND(SUM(distance_km)::numeric, 2) as total_distance_km,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  ROUND(MAX(max_speed_kmh)::numeric, 1) as max_speed_week
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('week', start_time)
ORDER BY week_start DESC;

-- 12. Get conversation history for this vehicle (to see what AI remembers)
SELECT 
  role,
  content,
  created_at,
  DATE(created_at) as conversation_date
FROM vehicle_chat_history
WHERE device_id = 'T-23695LA'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 30;

-- 13. Get trip analytics if available
SELECT 
  ta.driver_score,
  ta.harsh_events,
  ta.summary_text,
  ta.analyzed_at,
  t.start_time,
  t.distance_km,
  t.max_speed,
  ROUND(t.max_speed::numeric, 1) as max_speed_kmh
FROM trip_analytics ta
JOIN vehicle_trips t ON ta.trip_id = t.id
WHERE t.device_id = 'T-23695LA'
  AND ta.analyzed_at >= NOW() - INTERVAL '30 days'
ORDER BY ta.analyzed_at DESC
LIMIT 10;

-- 14. Get summary statistics for test question generation
SELECT 
  COUNT(*) as total_trips_30days,
  ROUND(SUM(distance_km)::numeric, 2) as total_distance_km,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  ROUND(MAX(distance_km)::numeric, 2) as max_distance_km,
  ROUND(MIN(distance_km)::numeric, 2) as min_distance_km,
  ROUND(MAX(max_speed)::numeric, 1) as max_speed_kmh,
  ROUND(AVG(max_speed)::numeric, 1) as avg_max_speed_kmh,
  COUNT(DISTINCT DATE(start_time)) as days_with_trips,
  MIN(start_time) as earliest_trip,
  MAX(end_time) as latest_trip
FROM vehicle_trips
WHERE device_id = 'T-23695LA'
  AND start_time >= NOW() - INTERVAL '30 days';
