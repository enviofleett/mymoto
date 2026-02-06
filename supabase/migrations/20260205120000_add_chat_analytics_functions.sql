-- Migration: Add Analytics Functions for Vehicle Chat
-- Description: Adds RPC functions to support "Favorite Parking Spots", "Drive Time", and "Usage Stats" for the AI agent.

-- 1. Get Frequent Locations (Parking Spots)
-- Uses ST_ClusterDBSCAN to group trip end locations within ~50m
CREATE OR REPLACE FUNCTION get_frequent_locations(
  p_device_id TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  latitude NUMERIC,
  longitude NUMERIC,
  visit_count BIGINT,
  last_visit TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
AS $$
  WITH clusters AS (
    SELECT 
      end_latitude, 
      end_longitude, 
      end_time,
      ST_ClusterDBSCAN(
        ST_SetSRID(ST_MakePoint(end_longitude, end_latitude), 4326), 
        eps := 0.0005, -- approx 50m
        minpoints := 2 -- Minimum 2 visits to count as a "spot"
      ) OVER () AS cid
    FROM vehicle_trips
    WHERE device_id = p_device_id
    AND end_latitude IS NOT NULL
    AND end_longitude IS NOT NULL
  ),
  grouped_clusters AS (
    SELECT 
      cid,
      AVG(end_latitude) as lat,
      AVG(end_longitude) as lon,
      COUNT(*) as visit_count,
      MAX(end_time) as last_visit
    FROM clusters
    WHERE cid IS NOT NULL
    GROUP BY cid
  )
  SELECT 
    lat::NUMERIC, 
    lon::NUMERIC, 
    visit_count, 
    last_visit
  FROM grouped_clusters
  ORDER BY visit_count DESC
  LIMIT p_limit;
$$;

-- 2. Get Vehicle Usage Stats (Drive Time, Parked Time, Distance)
CREATE OR REPLACE FUNCTION get_vehicle_usage_stats(
  p_device_id TEXT,
  p_start_time TIMESTAMP WITH TIME ZONE,
  p_end_time TIMESTAMP WITH TIME ZONE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_drive_seconds NUMERIC;
  v_trip_count INTEGER;
  v_total_distance NUMERIC;
  v_total_period_seconds NUMERIC;
  v_max_speed NUMERIC;
BEGIN
  -- Calculate total period
  v_total_period_seconds := EXTRACT(EPOCH FROM (p_end_time - p_start_time));
  
  SELECT 
    COALESCE(SUM(duration_seconds), 0),
    COUNT(*),
    COALESCE(SUM(distance_km), 0),
    COALESCE(MAX(max_speed), 0)
  INTO 
    v_drive_seconds,
    v_trip_count,
    v_total_distance,
    v_max_speed
  FROM vehicle_trips
  WHERE device_id = p_device_id
  AND start_time >= p_start_time
  AND end_time <= p_end_time;

  RETURN json_build_object(
    'drive_time_seconds', v_drive_seconds,
    'drive_time_hours', ROUND((v_drive_seconds / 3600.0)::numeric, 2),
    'parked_time_seconds', GREATEST(0, v_total_period_seconds - v_drive_seconds),
    'parked_time_hours', ROUND((GREATEST(0, v_total_period_seconds - v_drive_seconds) / 3600.0)::numeric, 2),
    'trip_count', v_trip_count,
    'total_distance_km', v_total_distance,
    'max_speed_kmh', v_max_speed,
    'period_total_hours', ROUND((v_total_period_seconds / 3600.0)::numeric, 2)
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_frequent_locations(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_frequent_locations(TEXT, INTEGER) TO service_role;

GRANT EXECUTE ON FUNCTION get_vehicle_usage_stats(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_vehicle_usage_stats(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO service_role;
