-- Migration: Fix Unique Constraint on vehicle_trips
-- Description: Changes the unique constraint from (device_id, start_time, end_time) to (device_id, start_time)
-- This is required for the sync_gps51_trip_to_vehicle_trips trigger to work correctly with ON CONFLICT (device_id, start_time)

-- 1. Drop the incorrect unique index
DROP INDEX IF EXISTS public.idx_vehicle_trips_unique_timing;

-- 2. Create the correct unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_device_start
ON public.vehicle_trips(device_id, start_time);
