-- Migration: Fix Vehicle Trips View Columns and Add Daily Stats
-- Description: 
-- 1. Updates vehicle_trips view to include start_time, end_time (renamed from trip_start_time/trip_end_time),
--    coordinates (start/end lat/lon), and speed stats.
-- 2. Creates vehicle_daily_stats view for aggregated daily metrics.
-- 3. Recreates get_daily_travel_stats, get_vehicle_mileage_stats, get_daily_mileage, and get_recent_trips functions (dropped by CASCADE).

-- =====================================================
-- 1. Safely drop existing views
-- =====================================================

DROP VIEW IF EXISTS public.vehicle_daily_stats CASCADE;
-- We need to drop vehicle_trips cascade because other objects might depend on it.
DROP VIEW IF EXISTS public.vehicle_trips CASCADE;

-- ===================================================== 
-- 2. Recreate vehicle_trips as a VIEW 
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
  'gps51_parity'::text AS source, 
  now() AS created_at 
FROM trip_aggregation 
WHERE trip_end_time > trip_start_time; 

-- Grant permissions
GRANT SELECT ON public.vehicle_trips TO authenticated; 
GRANT SELECT ON public.vehicle_trips TO service_role;


-- ===================================================== 
-- 3. Create vehicle_daily_stats View
-- ===================================================== 

CREATE OR REPLACE VIEW public.vehicle_daily_stats WITH (security_invoker = true) AS
SELECT
    device_id,
    DATE(start_time AT TIME ZONE 'Africa/Lagos') as stat_date,
    COUNT(*) as trip_count,
    COALESCE(SUM(distance_km), 0) as total_distance_km,
    COALESCE(AVG(distance_km), 0) as avg_distance_km,
    MAX(max_speed) as peak_speed,
    AVG(avg_speed) as avg_speed,
    COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
    MIN(start_time) as first_trip_start,
    MAX(end_time) as last_trip_end
FROM public.vehicle_trips
GROUP BY device_id, DATE(start_time AT TIME ZONE 'Africa/Lagos');

-- Grant permissions
GRANT SELECT ON public.vehicle_daily_stats TO authenticated;
GRANT SELECT ON public.vehicle_daily_stats TO service_role;

-- =====================================================
-- 4. Recreate get_daily_travel_stats function
-- =====================================================

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
    -- Filter for trips between 7am and 6pm Lagos time
    AND EXTRACT(HOUR FROM t.start_time AT TIME ZONE 'Africa/Lagos') >= 7
    AND EXTRACT(HOUR FROM t.end_time AT TIME ZONE 'Africa/Lagos') < 18
  GROUP BY DATE(t.start_time AT TIME ZONE 'Africa/Lagos')
  ORDER BY travel_date DESC;
END;
$$;

COMMENT ON FUNCTION get_daily_travel_stats IS 'Returns daily travel statistics (distance and time) for trips between 7am-6pm Lagos time';

GRANT EXECUTE ON FUNCTION get_daily_travel_stats(TEXT, DATE, DATE) TO authenticated;

-- =====================================================
-- 5. Recreate get_vehicle_mileage_stats function
-- =====================================================

DROP FUNCTION IF EXISTS public.get_vehicle_mileage_stats(TEXT);
CREATE OR REPLACE FUNCTION public.get_vehicle_mileage_stats(p_device_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  today_start TIMESTAMP WITH TIME ZONE;
  week_start TIMESTAMP WITH TIME ZONE;
  month_start TIMESTAMP WITH TIME ZONE;
BEGIN
  today_start := date_trunc('day', now());
  week_start := date_trunc('day', now() - INTERVAL '7 days');
  month_start := date_trunc('day', now() - INTERVAL '30 days');
  
  SELECT json_build_object(
    'today', COALESCE((
      SELECT SUM(distance_km) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= today_start
    ), 0),
    'week', COALESCE((
      SELECT SUM(distance_km) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= week_start
    ), 0),
    'month', COALESCE((
      SELECT SUM(distance_km) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= month_start
    ), 0),
    'trips_today', COALESCE((
      SELECT COUNT(*) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= today_start
    ), 0),
    'trips_week', COALESCE((
      SELECT COUNT(*) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= week_start
    ), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vehicle_mileage_stats(TEXT) TO authenticated;

-- =====================================================
-- 6. Recreate get_daily_mileage function
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_daily_mileage(p_device_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'day', to_char(d.date, 'Dy'),
      'date', d.date::DATE,
      'distance', COALESCE(t.distance, 0),
      'trips', COALESCE(t.trip_count, 0)
    ) ORDER BY d.date
  ) INTO result
  FROM (
    SELECT generate_series(
      date_trunc('day', now() - INTERVAL '6 days'),
      date_trunc('day', now()),
      INTERVAL '1 day'
    )::DATE AS date
  ) d
  LEFT JOIN (
    SELECT 
      date_trunc('day', start_time)::DATE AS day,
      SUM(distance_km) AS distance,
      COUNT(*) AS trip_count
    FROM vehicle_trips
    WHERE device_id = p_device_id
      AND start_time >= date_trunc('day', now() - INTERVAL '6 days')
    GROUP BY date_trunc('day', start_time)::DATE
  ) t ON d.date = t.day;
  
  RETURN COALESCE(result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_mileage(TEXT) TO authenticated;

-- =====================================================
-- 7. Recreate get_recent_trips function
-- =====================================================

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
    AND vt.end_time IS NOT NULL  -- Only completed trips
  ORDER BY vt.start_time DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_recent_trips(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_trips(TEXT, INTEGER) TO anon;
