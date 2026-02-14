-- Fix: Prevent gps51_trips -> vehicle_trips trigger from inserting NULL distance_km
-- Root cause: gps51_trips.distance_meters can be NULL; ROUND(NULL / 1000) yields NULL and violates
-- vehicle_trips.distance_km NOT NULL constraint.

CREATE OR REPLACE FUNCTION public.sync_gps51_trip_to_vehicle_trips()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
        COALESCE(NEW.id, gen_random_uuid()),
        NEW.start_time,
        NEW.end_time,
        ROUND((COALESCE(NEW.distance_meters, 0) / 1000.0)::numeric, 2),
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
        avg_speed = EXCLUDED.avg_speed,
        end_address = EXCLUDED.end_address;

    RETURN NEW;
END;
$$;

