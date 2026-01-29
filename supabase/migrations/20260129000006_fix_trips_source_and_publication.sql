-- Migration: Fix Vehicle Trips Source and Ensure Realtime Publication
-- Description: 
-- 1. Updates vehicle_trips view to use 'gps51' as source (instead of 'gps51_parity') to match frontend filters.
-- 2. Ensures proactive_vehicle_events table is in supabase_realtime publication.
-- 3. Recreates dependent views and functions.

-- =====================================================
-- 1. Safely drop existing views (Cascade handles dependencies)
-- =====================================================

DROP VIEW IF EXISTS public.vehicle_daily_stats CASCADE;
DROP VIEW IF EXISTS public.vehicle_trips CASCADE;

-- ===================================================== 
-- 2. Recreate vehicle_trips as a VIEW with 'gps51' source
-- ===================================================== 

CREATE OR REPLACE VIEW public.vehicle_trips WITH (security_invoker = true) AS 
WITH vehicle_telematics_data AS (
  SELECT
    ph.device_id AS vehicle_id,
    ph.gps_time AS device_time,
    ph.ignition_on AS ignition,
    ph.speed,
    ph.latitude,
    ph.longitude,
    COALESCE(vp.total_mileage, 0) AS odometer
  FROM position_history ph
  LEFT JOIN vehicle_positions vp ON ph.device_id = vp.device_id AND ph.gps_time = vp.gps_time
),
ordered_points AS ( 
  SELECT 
    vtd.vehicle_id, 
    vtd.device_time, 
    vtd.ignition, 
    vtd.speed, 
    vtd.latitude,
    vtd.longitude,
    vtd.odometer, 
    LAG(vtd.device_time) OVER ( 
      PARTITION BY vtd.vehicle_id 
      ORDER BY vtd.device_time 
    ) AS prev_time, 
    LAG(vtd.ignition) OVER ( 
      PARTITION BY vtd.vehicle_id 
      ORDER BY vtd.device_time 
    ) AS prev_ignition, 
    LAG(vtd.odometer) OVER ( 
      PARTITION BY vtd.vehicle_id 
      ORDER BY vtd.device_time 
    ) AS prev_odometer 
  FROM vehicle_telematics_data vtd 
), 

trip_boundaries AS ( 
  SELECT 
    *, 
    CASE 
      -- Trip starts when ignition turns ON 
      WHEN ignition = true AND (prev_ignition IS DISTINCT FROM true) 
        THEN 1 

      -- Trip starts again after 3 minutes of idle 
      WHEN ignition = true 
       AND prev_time IS NOT NULL 
       AND device_time - prev_time > INTERVAL '3 minutes' 
        THEN 1 

      ELSE 0 
    END AS trip_start_flag 
  FROM ordered_points 
), 

trip_groups AS ( 
  SELECT 
    *, 
    SUM(trip_start_flag) OVER ( 
      PARTITION BY vehicle_id 
      ORDER BY device_time 
      ROWS UNBOUNDED PRECEDING 
    ) AS trip_group 
  FROM trip_boundaries 
), 

trip_aggregation AS ( 
  SELECT 
    vehicle_id, 
    trip_group, 
    MIN(device_time) AS trip_start_time, 
    MAX(device_time) AS trip_end_time, 
    MAX(odometer) - MIN(odometer) AS distance_km,
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
  GREATEST(distance_km, 0) AS distance_km, 
  EXTRACT(EPOCH FROM (trip_end_time - trip_start_time))::INT AS duration_seconds, 
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  max_speed,
  avg_speed,
  'gps51'::text AS source, -- UPDATED: Changed from 'gps51_parity' to 'gps51'
  now() AS created_at 
FROM trip_aggregation 
WHERE trip_end_time > trip_start_time;

-- =====================================================
-- 3. Recreate vehicle_daily_stats VIEW
-- =====================================================

CREATE OR REPLACE VIEW public.vehicle_daily_stats WITH (security_invoker = true) AS
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

-- =====================================================
-- 4. Recreate Functions (dropped by CASCADE)
-- =====================================================

-- 4.1 get_daily_travel_stats
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

-- =====================================================
-- 5. Ensure Realtime Publication
-- =====================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.proactive_vehicle_events;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN OTHERS THEN NULL;
  END;
END $$;
