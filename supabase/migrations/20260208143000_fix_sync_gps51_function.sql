-- Migration: Fix Sync GPS51 Function Column Name
-- Description: Updates sync_gps51_trip_to_vehicle_trips to use correct 'id' column instead of 'trip_id'

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
        id, -- Corrected from trip_id to id
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
