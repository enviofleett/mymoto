-- Fix: count trips for full Lagos day (00:00-23:59), not only 07:00-18:00.
-- This affects /owner/vehicles "Trips Today" + "Distance Today" which use the
-- Edge Function daily-travel-stats -> RPC get_daily_travel_stats(p_device_id, p_start_date, p_end_date).

CREATE OR REPLACE FUNCTION public.get_daily_travel_stats(
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
  FROM public.vehicle_trips t
  WHERE t.device_id = p_device_id
    AND DATE(t.start_time AT TIME ZONE 'Africa/Lagos') >= p_start_date
    AND DATE(t.start_time AT TIME ZONE 'Africa/Lagos') <= p_end_date
  GROUP BY DATE(t.start_time AT TIME ZONE 'Africa/Lagos')
  ORDER BY travel_date DESC;
END;
$$;

COMMENT ON FUNCTION public.get_daily_travel_stats(TEXT, DATE, DATE)
  IS 'Returns daily travel statistics (distance and time) for trips across the full Lagos day.';

GRANT EXECUTE ON FUNCTION public.get_daily_travel_stats(TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_travel_stats(TEXT, DATE, DATE) TO service_role;

