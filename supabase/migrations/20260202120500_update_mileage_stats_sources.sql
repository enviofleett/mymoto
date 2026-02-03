-- Migration: Update Mileage Stats to include Fallback Trips
-- Description:
-- 1. Update get_vehicle_mileage_stats to include 'fallback_calculation' source
-- 2. Update get_daily_mileage to include 'fallback_calculation' source
-- 3. Update vehicle_daily_stats view to include 'fallback_calculation' source
--
-- This ensures that "Estimated" trips reconstructed from raw telemetry are counted in daily totals.

-- =====================================================
-- 1. Update get_vehicle_mileage_stats
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_vehicle_mileage_stats(p_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_km NUMERIC := 0;
  v_week_km NUMERIC := 0;
  v_month_km NUMERIC := 0;
  v_trips_today BIGINT := 0;
  v_trips_week BIGINT := 0;
  v_today_start TIMESTAMPTZ;
  v_week_start TIMESTAMPTZ;
  v_month_start TIMESTAMPTZ;
BEGIN
  v_today_start := date_trunc('day', (NOW() AT TIME ZONE 'Africa/Lagos')) AT TIME ZONE 'Africa/Lagos';
  v_week_start := v_today_start - INTERVAL '7 days';
  v_month_start := v_today_start - INTERVAL '30 days';

  -- Updated to include fallback_calculation
  SELECT
    COALESCE(SUM(t.distance_km), 0),
    COALESCE(COUNT(*)::BIGINT, 0)
  INTO v_today_km, v_trips_today
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND t.source IN ('gps51', 'fallback_calculation')
    AND t.start_time >= v_today_start
    AND t.start_time < v_today_start + INTERVAL '1 day';

  SELECT
    COALESCE(SUM(t.distance_km), 0),
    COALESCE(COUNT(*)::BIGINT, 0)
  INTO v_week_km, v_trips_week
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND t.source IN ('gps51', 'fallback_calculation')
    AND t.start_time >= v_week_start
    AND t.start_time < v_today_start + INTERVAL '1 day';

  SELECT COALESCE(SUM(t.distance_km), 0)
  INTO v_month_km
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND t.source IN ('gps51', 'fallback_calculation')
    AND t.start_time >= v_month_start
    AND t.start_time < v_today_start + INTERVAL '1 day';

  RETURN jsonb_build_object(
    'today', ROUND(v_today_km::numeric, 2),
    'week', ROUND(v_week_km::numeric, 2),
    'month', ROUND(v_month_km::numeric, 2),
    'trips_today', v_trips_today,
    'trips_week', v_trips_week
  );
END;
$$;

-- =====================================================
-- 2. Update get_daily_mileage
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_daily_mileage(
  p_device_id TEXT,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  day TEXT,
  date DATE,
  distance NUMERIC,
  trips BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date AS d
  ),
  daily_stats AS (
    SELECT
      DATE(t.start_time) AS trip_date,
      COALESCE(SUM(t.distance_km), 0) AS total_distance_km,
      COUNT(*) AS trip_count
    FROM vehicle_trips t
    WHERE t.device_id = p_device_id
      AND t.source IN ('gps51', 'fallback_calculation') -- Updated source filter
      AND t.start_time >= CURRENT_DATE - (p_days - 1)
      AND t.start_time < CURRENT_DATE + 1
      AND t.end_time IS NOT NULL
    GROUP BY DATE(t.start_time)
  )
  SELECT
    TO_CHAR(ds.d, 'Dy') AS day,
    ds.d AS date,
    COALESCE(ROUND(daily.total_distance_km::numeric, 2), 0) AS distance,
    COALESCE(daily.trip_count, 0) AS trips
  FROM date_series ds
  LEFT JOIN daily_stats daily ON ds.d = daily.trip_date
  ORDER BY ds.d DESC;
END;
$$;

-- =====================================================
-- 3. Update vehicle_daily_stats VIEW
-- =====================================================

-- We must drop dependent function first (if any), but get_vehicle_daily_stats depends on it.
-- We'll drop the view with CASCADE to handle dependencies, then recreate both.

DROP VIEW IF EXISTS public.vehicle_daily_stats CASCADE;

CREATE VIEW public.vehicle_daily_stats AS
SELECT
  device_id,
  date_trunc('day', start_time)::date AS stat_date,
  COUNT(*)::integer AS trip_count,
  ROUND(SUM(distance_km)::numeric, 2) AS total_distance_km,
  ROUND(AVG(distance_km)::numeric, 2) AS avg_distance_km,
  ROUND(MAX(max_speed)::numeric, 1) AS peak_speed,
  ROUND(AVG(avg_speed)::numeric, 1) AS avg_speed,
  COALESCE(SUM(duration_seconds), 0)::integer AS total_duration_seconds,
  MIN(start_time) AS first_trip_start,
  MAX(end_time) AS last_trip_end
FROM public.vehicle_trips
WHERE start_time >= NOW() - INTERVAL '90 days'
  AND source IN ('gps51', 'fallback_calculation') -- Updated source filter
GROUP BY device_id, date_trunc('day', start_time)::date
ORDER BY device_id, stat_date DESC;

-- Grant permissions for the view
GRANT SELECT ON public.vehicle_daily_stats TO authenticated;
GRANT SELECT ON public.vehicle_daily_stats TO anon;
GRANT SELECT ON public.vehicle_daily_stats TO service_role;

-- Recreate the RPC that depends on the view
CREATE OR REPLACE FUNCTION public.get_vehicle_daily_stats(
  p_device_id TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  device_id TEXT,
  stat_date DATE,
  trip_count INTEGER,
  total_distance_km NUMERIC,
  avg_distance_km NUMERIC,
  peak_speed NUMERIC,
  avg_speed NUMERIC,
  total_duration_seconds INTEGER,
  first_trip_start TIMESTAMPTZ,
  last_trip_end TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vds.device_id,
    vds.stat_date,
    vds.trip_count,
    vds.total_distance_km,
    vds.avg_distance_km,
    vds.peak_speed,
    vds.avg_speed,
    vds.total_duration_seconds,
    vds.first_trip_start,
    vds.last_trip_end
  FROM public.vehicle_daily_stats vds
  WHERE vds.device_id = p_device_id
    AND vds.stat_date >= CURRENT_DATE - p_days
  ORDER BY vds.stat_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vehicle_daily_stats(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vehicle_daily_stats(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_vehicle_daily_stats(TEXT, INTEGER) TO service_role;
