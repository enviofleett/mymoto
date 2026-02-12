-- Migration: Update Vehicle Trips View for Historical Accuracy
-- Description:
-- Updates the main `vehicle_trips` view to use the improved "Smart Trip Merging" logic
-- (3-minute gap detection) and PostGIS distance calculation.
-- This effectively "backfills" the accuracy improvements to all historical data queries,
-- reports, and statistics that rely on this view.

-- 1. Drop existing views and functions (Cascade handles dependencies)
DROP VIEW IF EXISTS public.vehicle_daily_stats CASCADE;
DROP VIEW IF EXISTS public.vehicle_trips CASCADE;

-- 2. Recreate vehicle_trips with IMPROVED LOGIC
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
  WHERE ph.ignition_on = true -- CRITICAL: Only look at ON points to ignore short OFF periods
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
      -- First point is always a start
      WHEN prev_time IS NULL THEN 1
      -- Gap > 3 minutes means new trip (GPS51 Logic)
      WHEN device_time - prev_time > INTERVAL '3 minutes' THEN 1 
      ELSE 0 
    END AS trip_start_flag,
    -- Calculate distance segment (if not new trip)
    CASE
      WHEN prev_time IS NULL THEN 0::float
      WHEN device_time - prev_time > INTERVAL '3 minutes' THEN 0::float -- Start of new trip has 0 dist from prev
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
    -- Coordinates
    (array_agg(latitude ORDER BY device_time ASC))[1] as start_latitude,
    (array_agg(longitude ORDER BY device_time ASC))[1] as start_longitude,
    (array_agg(latitude ORDER BY device_time DESC))[1] as end_latitude,
    (array_agg(longitude ORDER BY device_time DESC))[1] as end_longitude,
    -- Speed
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

-- 3. Recreate vehicle_daily_stats VIEW
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

-- 4. Recreate Dependent Functions

-- 4.1 get_daily_travel_stats
DROP FUNCTION IF EXISTS get_daily_travel_stats(TEXT, DATE);
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

-- 4.2 get_vehicle_mileage_stats
DROP FUNCTION IF EXISTS get_vehicle_mileage_stats(TEXT);
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

-- 4.3 get_daily_mileage
DROP FUNCTION IF EXISTS get_daily_mileage(TEXT, DATE, DATE);
CREATE OR REPLACE FUNCTION get_daily_mileage(
  p_device_id TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  day TEXT,
  date TEXT,
  distance NUMERIC,
  trips INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(stat_date, 'Day') AS day,
    stat_date::TEXT AS date,
    total_distance_km::NUMERIC AS distance,
    trip_count::INTEGER AS trips
  FROM vehicle_daily_stats
  WHERE device_id = p_device_id
    AND stat_date BETWEEN p_start_date AND p_end_date
  ORDER BY stat_date DESC;
END;
$$;

-- 4.4 get_recent_trips
DROP FUNCTION IF EXISTS get_recent_trips(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION get_recent_trips(
  p_device_id TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  start_latitude NUMERIC,
  start_longitude NUMERIC,
  end_latitude NUMERIC,
  end_longitude NUMERIC,
  distance_km NUMERIC,
  avg_speed_kmh NUMERIC,
  max_speed_kmh NUMERIC,
  duration_minutes NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vt.id,
    vt.device_id,
    vt.start_time,
    vt.end_time,
    vt.start_latitude::NUMERIC,
    vt.start_longitude::NUMERIC,
    vt.end_latitude::NUMERIC,
    vt.end_longitude::NUMERIC,
    vt.distance_km::NUMERIC,
    vt.avg_speed::NUMERIC AS avg_speed_kmh,
    vt.max_speed::NUMERIC AS max_speed_kmh,
    (vt.duration_seconds / 60.0)::NUMERIC AS duration_minutes
  FROM vehicle_trips vt
  WHERE vt.device_id = p_device_id
    AND vt.end_time IS NOT NULL
  ORDER BY vt.start_time DESC
  LIMIT p_limit;
END;
$$;

-- 5. Permissions
GRANT SELECT ON public.vehicle_trips TO authenticated;
GRANT SELECT ON public.vehicle_trips TO service_role;
GRANT SELECT ON public.vehicle_daily_stats TO authenticated;
GRANT SELECT ON public.vehicle_daily_stats TO service_role;
