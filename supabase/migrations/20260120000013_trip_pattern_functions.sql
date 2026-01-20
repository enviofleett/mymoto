-- SQL Functions for Proactive Trip Start Alerts
-- Phase 2.1: Get trip patterns for a device at a specific day/time

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
    -- Check if vehicle is at origin location (within 100m)
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
    AND tp.occurrence_count >= 3  -- Only recurring trips
    AND tp.confidence_score >= 0.5  -- Minimum confidence
  ORDER BY tp.occurrence_count DESC, tp.confidence_score DESC;
END;
$$;

COMMENT ON FUNCTION get_trip_patterns IS 'Returns trip patterns for proactive trip start alerts - only patterns with 3+ occurrences';

GRANT EXECUTE ON FUNCTION get_trip_patterns TO authenticated;
GRANT EXECUTE ON FUNCTION get_trip_patterns TO service_role;

-- Function to calculate battery drain rate
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
      AND battery_percent < prev_battery  -- Only count actual drain
      AND EXTRACT(EPOCH FROM (gps_time - prev_time)) BETWEEN 0.1 AND 24  -- Valid time range
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

COMMENT ON FUNCTION calculate_battery_drain IS 'Calculates average battery drain rate for anomaly detection';

GRANT EXECUTE ON FUNCTION calculate_battery_drain TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_battery_drain TO service_role;
