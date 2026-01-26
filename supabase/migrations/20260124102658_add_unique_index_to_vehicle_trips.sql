-- Migration: Add unique index to vehicle_trips
-- Description: Adds a unique index on (device_id, start_time, end_time) to prevent duplicate trip entries.

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_unique_timing
ON public.vehicle_trips(device_id, start_time, end_time)
WHERE start_time IS NOT NULL AND end_time IS NOT NULL;

-- Optional: If you also want a down migration to drop the index
-- DROP INDEX IF EXISTS public.idx_vehicle_trips_unique_timing;
