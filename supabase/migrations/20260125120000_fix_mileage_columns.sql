-- Migration: Fix vehicle_mileage_details column mismatch
-- Description: Recreate view with statisticsday (daily time-series) so frontend
-- can sort by date. Resolves Error 42703: column vehicle_mileage_details.statisticsday does not exist.

DROP VIEW IF EXISTS public.vehicle_mileage_details;

CREATE VIEW public.vehicle_mileage_details AS
SELECT
    device_id,
    DATE(start_time AT TIME ZONE 'Africa/Lagos') AS statisticsday,
    ROUND(SUM(distance_km)::numeric, 2) AS total_mileage,
    COUNT(*)::integer AS trip_count
FROM public.vehicle_trips
GROUP BY device_id, DATE(start_time AT TIME ZONE 'Africa/Lagos');

GRANT SELECT ON public.vehicle_mileage_details TO authenticated;
GRANT SELECT ON public.vehicle_mileage_details TO anon;

COMMENT ON VIEW public.vehicle_mileage_details IS 'Daily mileage per device (statisticsday, total_mileage, trip_count). Used for mileage history graph and frontend sort by date.';
