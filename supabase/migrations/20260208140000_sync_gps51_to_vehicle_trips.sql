-- Migration: Sync GPS51 Trips to Vehicle Trips
-- Description: Creates a trigger to automatically normalize raw GPS51 trips into the main vehicle_trips table for the Chat Agent.

-- 1. Create the Sync Function
CREATE OR REPLACE FUNCTION public.sync_gps51_trip_to_vehicle_trips()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Insert into vehicle_trips with ON CONFLICT (idempotency)
    -- We map GPS51 fields to the normalized schema
    INSERT INTO public.vehicle_trips (
        device_id,
        id,
        start_time,
        end_time,
        distance_km,
        duration_seconds,
        max_speed,
        avg_speed,
        start_address,
        end_address,
        start_latitude,
        start_longitude,
        end_latitude,
        end_longitude,
        source,
        created_at
    )
    VALUES (
        NEW.device_id,
        -- Generate a deterministic UUID if id is missing, or use provided
        COALESCE(NEW.id, gen_random_uuid()),
        NEW.start_time,
        NEW.end_time,
        -- Convert meters to KM
        ROUND((NEW.distance_meters / 1000.0)::numeric, 2),
        -- Duration is already in seconds
        NEW.duration_seconds,
        NEW.max_speed_kmh,
        NEW.avg_speed_kmh,
        NULL,
        NULL,
        NEW.start_latitude,
        NEW.start_longitude,
        NEW.end_latitude,
        NEW.end_longitude,
        'gps51',
        NOW()
    )
    ON CONFLICT (device_id, start_time) 
    DO UPDATE SET
        end_time = EXCLUDED.end_time,
        distance_km = EXCLUDED.distance_km,
        duration_seconds = EXCLUDED.duration_seconds,
        max_speed = EXCLUDED.max_speed,
        end_address = EXCLUDED.end_address;

    RETURN NEW;
END;
$$;

-- 2. Create the Trigger
DROP TRIGGER IF EXISTS trigger_sync_gps51_trips ON public.gps51_trips;

CREATE TRIGGER trigger_sync_gps51_trips
AFTER INSERT OR UPDATE ON public.gps51_trips
FOR EACH ROW
EXECUTE FUNCTION public.sync_gps51_trip_to_vehicle_trips();

-- 3. Backfill Existing Data (One-time repair)
-- This ensures the user's "yesterday" data is immediately visible
INSERT INTO public.vehicle_trips (
    device_id,
    id,
    start_time,
    end_time,
    distance_km,
    duration_seconds,
    max_speed,
    avg_speed,
    start_address,
    end_address,
    start_latitude,
    start_longitude,
    end_latitude,
    end_longitude,
    source,
    created_at
)
SELECT
    device_id,
    id,
    start_time,
    end_time,
    ROUND((distance_meters / 1000.0)::numeric, 2),
    duration_seconds,
    max_speed_kmh,
    avg_speed_kmh,
    NULL,
    NULL,
    start_latitude,
    start_longitude,
    end_latitude,
    end_longitude,
    'gps51',
    NOW()
FROM public.gps51_trips
WHERE NOT EXISTS (
    SELECT 1 FROM public.vehicle_trips vt 
    WHERE vt.device_id = gps51_trips.device_id 
    AND vt.start_time = gps51_trips.start_time
);
