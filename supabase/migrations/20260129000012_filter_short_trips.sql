-- Migration: Filter Short Trips (Ghost Trips)
-- Description:
-- Adds a filter to vehicle_trips view and RPC function to exclude trips with < 0.05 km (50m) distance.
-- This removes "idling" trips where ignition is ON but vehicle is stationary.

-- 1. Update RPC Function
CREATE OR REPLACE FUNCTION get_vehicle_trips_optimized(
  p_device_id TEXT,
  p_limit INTEGER DEFAULT 200,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  distance_km NUMERIC,
  duration_seconds INTEGER,
  start_latitude DOUBLE PRECISION,
  start_longitude DOUBLE PRECISION,
  end_latitude DOUBLE PRECISION,
  end_longitude DOUBLE PRECISION,
  max_speed DOUBLE PRECISION,
  avg_speed DOUBLE PRECISION,
  source TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH vehicle_telematics_data AS (
    SELECT
      ph.device_id AS vehicle_id,
      ph.gps_time AS device_time,
      ph.ignition_on AS ignition,
      ph.speed,
      ph.latitude,
      ph.longitude
    FROM position_history ph
    WHERE ph.device_id = p_device_id
    AND (p_start_date IS NULL OR ph.gps_time >= p_start_date::timestamp with time zone)
    AND (p_end_date IS NULL OR ph.gps_time < p_end_date::timestamp with time zone)
    AND ph.ignition_on = true -- CRITICAL: Only look at ON points to ignore short OFF periods
  ),
  ordered_points AS ( 
    SELECT 
      vtd.vehicle_id, 
      vtd.device_time, 
      vtd.speed, 
      vtd.latitude,
      vtd.longitude,
      LAG(vtd.device_time) OVER (ORDER BY vtd.device_time) AS prev_time, 
      LAG(vtd.latitude) OVER (ORDER BY vtd.device_time) AS prev_lat,
      LAG(vtd.longitude) OVER (ORDER BY vtd.device_time) AS prev_lon
    FROM vehicle_telematics_data vtd 
  ), 
  trip_boundaries AS ( 
    SELECT 
      *, 
      CASE 
        WHEN prev_time IS NULL THEN 1
        WHEN device_time - prev_time > INTERVAL '3 minutes' THEN 1 
        ELSE 0 
      END AS trip_start_flag,
      CASE
        WHEN prev_time IS NULL THEN 0::float
        WHEN device_time - prev_time > INTERVAL '3 minutes' THEN 0::float
        ELSE 
          -- Use PostGIS ST_Distance for accurate geodetic distance in meters
          ST_Distance(
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
            ST_SetSRID(ST_MakePoint(prev_lon, prev_lat), 4326)::geography
          ) / 1000.0 -- Convert to KM
      END AS dist_segment
    FROM ordered_points 
  ), 
  trip_groups AS ( 
    SELECT 
      *, 
      SUM(trip_start_flag) OVER (ORDER BY device_time ROWS UNBOUNDED PRECEDING) AS trip_group 
    FROM trip_boundaries 
  ), 
  trip_aggregation AS ( 
    SELECT 
      vehicle_id, 
      trip_group, 
      MIN(device_time) AS trip_start_time, 
      MAX(device_time) AS trip_end_time, 
      SUM(dist_segment) AS agg_distance_km,
      (array_agg(latitude ORDER BY device_time ASC))[1] as agg_start_latitude,
      (array_agg(longitude ORDER BY device_time ASC))[1] as agg_start_longitude,
      (array_agg(latitude ORDER BY device_time DESC))[1] as agg_end_latitude,
      (array_agg(longitude ORDER BY device_time DESC))[1] as agg_end_longitude,
      MAX(speed) as agg_max_speed,
      AVG(speed) as agg_avg_speed
    FROM trip_groups 
    GROUP BY vehicle_id, trip_group 
  ) 
  SELECT 
    gen_random_uuid() AS id, 
    ta.vehicle_id AS device_id,
    ta.trip_start_time AS start_time, 
    ta.trip_end_time AS end_time, 
    GREATEST(ta.agg_distance_km, 0)::numeric AS distance_km, 
    EXTRACT(EPOCH FROM (ta.trip_end_time - ta.trip_start_time))::INT AS duration_seconds, 
    ta.agg_start_latitude AS start_latitude,
    ta.agg_start_longitude AS start_longitude,
    ta.agg_end_latitude AS end_latitude,
    ta.agg_end_longitude AS end_longitude,
    ta.agg_max_speed AS max_speed,
    ta.agg_avg_speed AS avg_speed,
    'gps51'::text AS source
  FROM trip_aggregation ta
  WHERE ta.trip_end_time > ta.trip_start_time
  AND ta.agg_distance_km >= 0.05
  ORDER BY ta.trip_start_time DESC
  LIMIT p_limit;
END;
$$;

-- 2. Update View and Dependencies
DROP VIEW IF EXISTS public.vehicle_daily_stats CASCADE;
DROP VIEW IF EXISTS public.vehicle_trips CASCADE;

CREATE VIEW public.vehicle_trips WITH (security_invoker = true) AS 
WITH vehicle_telematics_data AS (
  SELECT
    ph.device_id AS vehicle_id,
    ph.gps_time AS device_time,
    ph.ignition_on AS ignition,
    ph.speed,
    ph.latitude,
    ph.longitude
  FROM position_history ph
  WHERE ph.ignition_on = true 
),
ordered_points AS ( 
  SELECT 
    vtd.vehicle_id, 
    vtd.device_time, 
    vtd.speed, 
    vtd.latitude,
    vtd.longitude,
    LAG(vtd.device_time) OVER (PARTITION BY vtd.vehicle_id ORDER BY vtd.device_time) AS prev_time, 
    LAG(vtd.latitude) OVER (PARTITION BY vtd.vehicle_id ORDER BY vtd.device_time) AS prev_lat,
    LAG(vtd.longitude) OVER (PARTITION BY vtd.vehicle_id ORDER BY vtd.device_time) AS prev_lon
  FROM vehicle_telematics_data vtd 
), 
trip_boundaries AS ( 
  SELECT 
    *, 
    CASE 
      WHEN prev_time IS NULL THEN 1
      WHEN device_time - prev_time > INTERVAL '3 minutes' THEN 1 
      ELSE 0 
    END AS trip_start_flag,
    CASE
      WHEN prev_time IS NULL THEN 0::float
      WHEN device_time - prev_time > INTERVAL '3 minutes' THEN 0::float 
      ELSE 
        ST_Distance(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(prev_lon, prev_lat), 4326)::geography
        ) / 1000.0 
      END AS dist_segment
  FROM ordered_points 
), 
trip_groups AS ( 
  SELECT 
    *, 
    SUM(trip_start_flag) OVER (PARTITION BY vehicle_id ORDER BY device_time ROWS UNBOUNDED PRECEDING) AS trip_group 
  FROM trip_boundaries 
), 
trip_aggregation AS ( 
  SELECT 
    vehicle_id, 
    trip_group, 
    MIN(device_time) AS trip_start_time, 
    MAX(device_time) AS trip_end_time, 
    SUM(dist_segment) AS distance_km,
    (array_agg(latitude ORDER BY device_time ASC))[1] as start_latitude,
    (array_agg(longitude ORDER BY device_time ASC))[1] as start_longitude,
    (array_agg(latitude ORDER BY device_time DESC))[1] as end_latitude,
    (array_agg(longitude ORDER BY device_time DESC))[1] as end_longitude,
    MAX(speed) as max_speed,
    AVG(speed) as avg_speed
  FROM trip_groups 
  GROUP BY vehicle_id, trip_group 
) 
SELECT 
  gen_random_uuid() AS id, 
  vehicle_id AS device_id,
  trip_start_time AS start_time, 
  trip_end_time AS end_time, 
  GREATEST(distance_km, 0)::numeric AS distance_km, 
  EXTRACT(EPOCH FROM (trip_end_time - trip_start_time))::INT AS duration_seconds, 
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  max_speed,
  avg_speed,
  'gps51'::text AS source, 
  now() AS created_at 
FROM trip_aggregation 
WHERE trip_end_time > trip_start_time
AND distance_km >= 0.05;

CREATE VIEW public.vehicle_daily_stats WITH (security_invoker = true) AS
SELECT
    device_id,
    date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')::date as stat_date,
    count(*) as trip_count,
    coalesce(sum(distance_km), 0) as total_distance_km,
    coalesce(avg(distance_km), 0) as avg_distance_km,
    max(max_speed) as peak_speed,
    avg(avg_speed) as avg_speed,
    coalesce(sum(duration_seconds), 0) as total_duration_seconds,
    min(start_time) as first_trip_start,
    max(end_time) as last_trip_end
FROM public.vehicle_trips
GROUP BY device_id, date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')::date;

CREATE OR REPLACE FUNCTION get_daily_travel_stats(
  p_device_id TEXT,
  p_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stats RECORD;
BEGIN
  SELECT 
    trip_count,
    total_distance_km,
    total_duration_seconds
  INTO v_stats
  FROM vehicle_daily_stats
  WHERE device_id = p_device_id 
  AND stat_date = p_date;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'total_trips', 0,
      'total_distance_km', 0,
      'total_duration_hours', 0
    );
  END IF;

  RETURN json_build_object(
    'total_trips', v_stats.trip_count,
    'total_distance_km', v_stats.total_distance_km,
    'total_duration_hours', ROUND((v_stats.total_duration_seconds / 3600.0)::numeric, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_vehicle_mileage_stats(
  p_device_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_week_start DATE := date_trunc('week', now() AT TIME ZONE 'Africa/Lagos')::date;
  v_month_start DATE := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos')::date;
  
  v_today_stats RECORD;
  v_week_stats RECORD;
  v_month_stats RECORD;
BEGIN
  -- Today
  SELECT COALESCE(SUM(total_distance_km), 0) as dist, COALESCE(SUM(trip_count), 0) as trips
  INTO v_today_stats
  FROM vehicle_daily_stats
  WHERE device_id = p_device_id AND stat_date = v_today;

  -- Week
  SELECT COALESCE(SUM(total_distance_km), 0) as dist, COALESCE(SUM(trip_count), 0) as trips
  INTO v_week_stats
  FROM vehicle_daily_stats
  WHERE device_id = p_device_id AND stat_date >= v_week_start;

  -- Month
  SELECT COALESCE(SUM(total_distance_km), 0) as dist
  INTO v_month_stats
  FROM vehicle_daily_stats
  WHERE device_id = p_device_id AND stat_date >= v_month_start;

  RETURN json_build_object(
    'today', COALESCE(v_today_stats.dist, 0),
    'week', COALESCE(v_week_stats.dist, 0),
    'month', COALESCE(v_month_stats.dist, 0),
    'trips_today', COALESCE(v_today_stats.trips, 0),
    'trips_week', COALESCE(v_week_stats.trips, 0)
  );
END;
$$;
