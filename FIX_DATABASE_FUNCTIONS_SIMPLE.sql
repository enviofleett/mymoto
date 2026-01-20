-- ============================================================================
-- SIMPLE FIX: Create Missing Database Functions
-- Copy and paste this ENTIRE file into Supabase SQL Editor and click Run
-- ============================================================================

-- Function 1: get_daily_travel_stats
CREATE OR REPLACE FUNCTION get_daily_travel_stats(
  p_device_id TEXT,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  travel_date DATE,
  total_distance_km NUMERIC,
  total_travel_time_minutes NUMERIC,
  trip_count BIGINT,
  avg_speed_kmh NUMERIC,
  max_speed_kmh NUMERIC,
  first_trip_start TIMESTAMP WITH TIME ZONE,
  last_trip_end TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(t.start_time AT TIME ZONE 'Africa/Lagos') as travel_date,
    ROUND(SUM(t.distance_km)::NUMERIC, 2) as total_distance_km,
    ROUND(SUM(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 60)::NUMERIC, 2) as total_travel_time_minutes,
    COUNT(*)::BIGINT as trip_count,
    ROUND(AVG(t.avg_speed)::NUMERIC, 2) as avg_speed_kmh,
    ROUND(MAX(t.max_speed)::NUMERIC, 2) as max_speed_kmh,
    MIN(t.start_time) as first_trip_start,
    MAX(t.end_time) as last_trip_end
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND DATE(t.start_time AT TIME ZONE 'Africa/Lagos') >= p_start_date
    AND DATE(t.start_time AT TIME ZONE 'Africa/Lagos') <= p_end_date
    AND EXTRACT(HOUR FROM t.start_time AT TIME ZONE 'Africa/Lagos') >= 7
    AND EXTRACT(HOUR FROM t.end_time AT TIME ZONE 'Africa/Lagos') < 18
  GROUP BY DATE(t.start_time AT TIME ZONE 'Africa/Lagos')
  ORDER BY travel_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_travel_stats(TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_travel_stats(TEXT, DATE, DATE) TO service_role;

-- Function 2: get_trip_patterns
CREATE OR REPLACE FUNCTION get_trip_patterns(
  p_device_id TEXT,
  p_day_of_week INTEGER,
  p_hour_of_day INTEGER,
  p_current_lat DOUBLE PRECISION DEFAULT NULL,
  p_current_lon DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
  pattern_id UUID,
  origin_latitude DOUBLE PRECISION,
  origin_longitude DOUBLE PRECISION,
  origin_name TEXT,
  destination_latitude DOUBLE PRECISION,
  destination_longitude DOUBLE PRECISION,
  destination_name TEXT,
  typical_start_hour INTEGER,
  occurrence_count INTEGER,
  avg_duration_minutes NUMERIC,
  avg_distance_km NUMERIC,
  confidence_score NUMERIC,
  last_occurrence TIMESTAMPTZ,
  is_at_origin BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tp.id as pattern_id,
    tp.origin_latitude,
    tp.origin_longitude,
    tp.origin_name,
    tp.destination_latitude,
    tp.destination_longitude,
    tp.destination_name,
    tp.typical_start_hour,
    tp.occurrence_count,
    tp.avg_duration_minutes,
    tp.avg_distance_km,
    tp.confidence_score,
    tp.last_occurrence,
    CASE 
      WHEN p_current_lat IS NOT NULL AND p_current_lon IS NOT NULL THEN
        (6371000 * acos(
          cos(radians(p_current_lat)) * 
          cos(radians(tp.origin_latitude)) * 
          cos(radians(tp.origin_longitude) - radians(p_current_lon)) + 
          sin(radians(p_current_lat)) * 
          sin(radians(tp.origin_latitude))
        )) < 100
      ELSE false
    END as is_at_origin
  FROM trip_patterns tp
  WHERE tp.device_id = p_device_id
    AND tp.day_of_week = p_day_of_week
    AND tp.typical_start_hour = p_hour_of_day
    AND tp.occurrence_count >= 3
    AND tp.confidence_score >= 0.5
  ORDER BY tp.occurrence_count DESC, tp.confidence_score DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_trip_patterns TO authenticated;
GRANT EXECUTE ON FUNCTION get_trip_patterns TO service_role;

-- Function 3: calculate_battery_drain
CREATE OR REPLACE FUNCTION calculate_battery_drain(
  p_device_id TEXT,
  p_lookback_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  avg_drain_per_hour NUMERIC,
  avg_drain_per_day NUMERIC,
  sample_count BIGINT,
  last_battery_percent NUMERIC,
  last_battery_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH battery_readings AS (
    SELECT 
      battery_percent,
      gps_time,
      LAG(battery_percent) OVER (ORDER BY gps_time) as prev_battery,
      LAG(gps_time) OVER (ORDER BY gps_time) as prev_time
    FROM position_history
    WHERE device_id = p_device_id
      AND battery_percent IS NOT NULL
      AND battery_percent > 0
      AND gps_time >= NOW() - (p_lookback_days || ' days')::INTERVAL
    ORDER BY gps_time
  ),
  drain_calculations AS (
    SELECT 
      battery_percent - prev_battery as drain,
      EXTRACT(EPOCH FROM (gps_time - prev_time)) / 3600.0 as hours_diff
    FROM battery_readings
    WHERE prev_battery IS NOT NULL
      AND prev_time IS NOT NULL
      AND battery_percent < prev_battery
      AND EXTRACT(EPOCH FROM (gps_time - prev_time)) BETWEEN 0.1 AND 24
  )
  SELECT 
    COALESCE(AVG(drain / NULLIF(hours_diff, 0)), 0)::NUMERIC as avg_drain_per_hour,
    COALESCE(AVG(drain / NULLIF(hours_diff, 0)) * 24, 0)::NUMERIC as avg_drain_per_day,
    COUNT(*)::BIGINT as sample_count,
    (SELECT battery_percent FROM position_history 
     WHERE device_id = p_device_id 
     AND battery_percent IS NOT NULL 
     ORDER BY gps_time DESC LIMIT 1)::NUMERIC as last_battery_percent,
    (SELECT gps_time FROM position_history 
     WHERE device_id = p_device_id 
     AND battery_percent IS NOT NULL 
     ORDER BY gps_time DESC LIMIT 1) as last_battery_time
  FROM drain_calculations;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_battery_drain TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_battery_drain TO service_role;

-- Verification: Check if functions were created
SELECT 
  '✅ Functions Created' as status,
  COUNT(*) as count,
  string_agg(routine_name, ', ') as functions
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('get_daily_travel_stats', 'get_trip_patterns', 'calculate_battery_drain');

-- If you see 3 functions listed above, you're good! 
-- Re-run VERIFY_PRODUCTION_READY.sql to confirm all checks pass.
