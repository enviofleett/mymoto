-- Migration: Create vehicle_trips Table
-- Description: Creates a dedicated table for processed vehicle trip data from the process-trips Edge Function.

CREATE TABLE IF NOT EXISTS public.vehicle_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    start_latitude DOUBLE PRECISION NOT NULL,
    start_longitude DOUBLE PRECISION NOT NULL,
    end_latitude DOUBLE PRECISION NOT NULL,
    end_longitude DOUBLE PRECISION NOT NULL,
    distance_km NUMERIC(10, 2) NOT NULL,
    max_speed NUMERIC(6, 1),
    avg_speed NUMERIC(6, 1),
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_id_start_time ON public.vehicle_trips(device_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_start_time ON public.vehicle_trips(start_time DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.vehicle_trips ENABLE ROW LEVEL SECURITY;

-- Policies for RLS
-- Allow authenticated users to view their own vehicle's trips
DROP POLICY IF EXISTS "Allow authenticated read access to vehicle trips" ON public.vehicle_trips;
-- This policy is replaced by "Allow vehicle owners/providers to view vehicle trips" below which uses vehicle_assignments


-- Allow service role to insert trips (Edge Function)
DROP POLICY IF EXISTS "Allow service role to insert vehicle trips" ON public.vehicle_trips;
CREATE POLICY "Allow service role to insert vehicle trips" ON public.vehicle_trips
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Allow authenticated users to view trips for vehicles they have access to
DROP POLICY IF EXISTS "Allow vehicle owners/providers to view vehicle trips" ON public.vehicle_trips;
CREATE POLICY "Allow vehicle owners/providers to view vehicle trips" ON public.vehicle_trips
    FOR SELECT USING (EXISTS (
        SELECT 1 
        FROM public.vehicle_assignments va
        JOIN public.profiles p ON va.profile_id = p.id
        WHERE va.device_id = vehicle_trips.device_id
        AND p.user_id = auth.uid()
    ));

