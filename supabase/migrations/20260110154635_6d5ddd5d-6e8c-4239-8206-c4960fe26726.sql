-- Create a view for pre-calculated daily vehicle statistics
-- This replaces client-side math with server-side aggregation
CREATE OR REPLACE VIEW public.vehicle_daily_stats AS
SELECT 
  device_id,
  date_trunc('day', start_time)::date AS stat_date,
  COUNT(*)::integer AS trip_count,
  ROUND(SUM(distance_km)::numeric, 2) AS total_distance_km,
  ROUND(AVG(distance_km)::numeric, 2) AS avg_distance_km,
  ROUND(MAX(max_speed)::numeric, 1) AS peak_speed,
  ROUND(AVG(avg_speed)::numeric, 1) AS avg_speed,
  SUM(duration_seconds)::integer AS total_duration_seconds,
  MIN(start_time) AS first_trip_start,
  MAX(end_time) AS last_trip_end
FROM public.vehicle_trips
WHERE start_time >= NOW() - INTERVAL '90 days'
GROUP BY device_id, date_trunc('day', start_time)::date
ORDER BY device_id, stat_date DESC;

-- Add comment for documentation
COMMENT ON VIEW public.vehicle_daily_stats IS 'Pre-calculated daily vehicle statistics from vehicle_trips table. Used by OwnerVehicleProfile for instant mileage data display.';