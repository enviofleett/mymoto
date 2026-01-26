-- Migration: Create vehicle_mileage_details view
-- Description: Creates the missing vehicle_mileage_details view to resolve 404 errors.
-- This view aggregates total mileage per vehicle from vehicle_trips.

CREATE OR REPLACE VIEW public.vehicle_mileage_details AS
SELECT 
    v.device_id,
    v.device_name as vehicle_name,
    COALESCE(SUM(t.distance_km), 0) as total_mileage
FROM public.vehicles v
LEFT JOIN public.vehicle_trips t ON v.device_id = t.device_id
GROUP BY v.device_id, v.device_name;

GRANT SELECT ON public.vehicle_mileage_details TO authenticated;
GRANT SELECT ON public.vehicle_mileage_details TO anon;

COMMENT ON VIEW public.vehicle_mileage_details IS 'Aggregates total mileage per vehicle from vehicle_trips. Used by frontend for mileage display.';
