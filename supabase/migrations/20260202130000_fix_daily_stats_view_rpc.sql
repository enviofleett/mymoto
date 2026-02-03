-- Fix vehicle_daily_stats view and RPC type mismatch
-- Recreates view with explicit integer casts and Lagos timezone handling
-- Recreates RPC with matching return types

BEGIN;

-- 1. Drop existing view and dependent RPCs
DROP VIEW IF EXISTS public.vehicle_daily_stats CASCADE;

-- 2. Create View with explicit casts and Lagos timezone
-- We use COUNT(*)::integer to ensure compatibility with RPC integer return type
-- We use date_trunc on Lagos time to ensure days match user's local time
CREATE VIEW public.vehicle_daily_stats AS
SELECT
  device_id,
  date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')::date AS stat_date,
  COUNT(*)::integer AS trip_count,
  ROUND(COALESCE(SUM(distance_km), 0)::numeric, 2) AS total_distance_km,
  ROUND(COALESCE(AVG(distance_km), 0)::numeric, 2) AS avg_distance_km,
  ROUND(COALESCE(MAX(max_speed), 0)::numeric, 1) AS peak_speed,
  ROUND(COALESCE(AVG(avg_speed), 0)::numeric, 1) AS avg_speed,
  COALESCE(SUM(duration_seconds), 0)::integer AS total_duration_seconds,
  MIN(start_time) AS first_trip_start,
  MAX(end_time) AS last_trip_end
FROM public.vehicle_trips
WHERE source IN ('gps51', 'fallback_calculation')
GROUP BY device_id, date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')::date
ORDER BY device_id, stat_date DESC;

-- 3. Grant permissions
GRANT SELECT ON public.vehicle_daily_stats TO authenticated;
GRANT SELECT ON public.vehicle_daily_stats TO service_role;
GRANT SELECT ON public.vehicle_daily_stats TO anon;

-- 4. Recreate RPC with matching types
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
    AND vds.stat_date >= (CURRENT_DATE - p_days)
  ORDER BY vds.stat_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vehicle_daily_stats(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vehicle_daily_stats(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_vehicle_daily_stats(TEXT, INTEGER) TO anon;

COMMIT;
