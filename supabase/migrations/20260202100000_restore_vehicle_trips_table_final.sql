-- Migration: Restore vehicle_trips as Table and Fix RLS
-- Description:
-- 1. Ensures vehicle_trips is a TABLE (not a View) to allow sync-trips-incremental to write to it.
-- 2. Restores all columns including recent address fields.
-- 3. Recreates vehicle_daily_stats View (dropped by CASCADE).
-- 4. Ensures RLS policies allow Users to see their own data.

-- =====================================================
-- 1. Ensure vehicle_trips is a TABLE
-- =====================================================

DO $$
BEGIN
    -- Drop VIEW if it exists (CASCADE will drop dependent views like vehicle_daily_stats)
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'vehicle_trips') THEN
        DROP VIEW public.vehicle_trips CASCADE;
    END IF;
END $$;

-- Create Table if not exists
CREATE TABLE IF NOT EXISTS public.vehicle_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    start_latitude DOUBLE PRECISION DEFAULT 0,
    start_longitude DOUBLE PRECISION DEFAULT 0,
    end_latitude DOUBLE PRECISION DEFAULT 0,
    end_longitude DOUBLE PRECISION DEFAULT 0,
    distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_speed NUMERIC(6, 1),
    avg_speed NUMERIC(6, 1),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'gps51',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Extended columns (from cleanup migration)
    start_location_name TEXT,
    end_location_name TEXT,
    start_address TEXT,
    end_address TEXT,
    start_district TEXT,
    end_district TEXT,
    start_poi_name TEXT,
    end_poi_name TEXT,

    -- Constraint: source must be valid
    CONSTRAINT valid_source CHECK (source IN ('gps51', 'gps51_parity', 'position_history', 'manual'))
);

-- Ensure columns exist (in case table existed but was old version)
DO $$
BEGIN
    ALTER TABLE public.vehicle_trips ADD COLUMN IF NOT EXISTS start_location_name TEXT;
    ALTER TABLE public.vehicle_trips ADD COLUMN IF NOT EXISTS end_location_name TEXT;
    ALTER TABLE public.vehicle_trips ADD COLUMN IF NOT EXISTS start_address TEXT;
    ALTER TABLE public.vehicle_trips ADD COLUMN IF NOT EXISTS end_address TEXT;
    ALTER TABLE public.vehicle_trips ADD COLUMN IF NOT EXISTS start_district TEXT;
    ALTER TABLE public.vehicle_trips ADD COLUMN IF NOT EXISTS end_district TEXT;
    ALTER TABLE public.vehicle_trips ADD COLUMN IF NOT EXISTS start_poi_name TEXT;
    ALTER TABLE public.vehicle_trips ADD COLUMN IF NOT EXISTS end_poi_name TEXT;
    
    -- Allow NULL source in constraint if needed, but default is gps51. 
    -- Constraint is already set on CREATE, but if table exists, we might need to update check.
    -- We'll skip complex constraint updates for now as 'gps51' is default.
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_id_start_time ON public.vehicle_trips(device_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_start_time ON public.vehicle_trips(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_source ON public.vehicle_trips(source);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_source ON public.vehicle_trips(device_id, source);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_fuzzy_start ON public.vehicle_trips USING GIN (start_location_name gin_trgm_ops);

-- Deduplicate existing trips before creating unique index
DELETE FROM public.vehicle_trips
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY device_id, start_time, end_time
                   ORDER BY created_at DESC, id DESC
               ) as row_num
        FROM public.vehicle_trips
    ) t
    WHERE t.row_num > 1
);

-- Unique constraint to prevent duplicates (Device + Start + End)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_unique_timing
    ON public.vehicle_trips(device_id, start_time, end_time)
    WHERE start_time IS NOT NULL AND end_time IS NOT NULL;

-- =====================================================
-- 2. RLS Policies (vehicle_trips)
-- =====================================================

ALTER TABLE public.vehicle_trips ENABLE ROW LEVEL SECURITY;

-- Drop old policies to be safe
DROP POLICY IF EXISTS "Users can view vehicle trips for assigned vehicles" ON public.vehicle_trips;
DROP POLICY IF EXISTS "Allow service role to insert vehicle trips" ON public.vehicle_trips;
DROP POLICY IF EXISTS "Allow authenticated read access to vehicle trips" ON public.vehicle_trips;
DROP POLICY IF EXISTS "Service role can manage all trips" ON public.vehicle_trips;
DROP POLICY IF EXISTS "Users can view assigned vehicle trips" ON public.vehicle_trips;

-- Create Policies
CREATE POLICY "Users can view assigned vehicle trips" ON public.vehicle_trips
    FOR SELECT USING (
        public.has_role(auth.uid(), 'admin')
        OR EXISTS (
            SELECT 1 FROM public.vehicle_assignments va
            JOIN public.profiles p ON p.id = va.profile_id
            WHERE va.device_id = vehicle_trips.device_id AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all trips" ON public.vehicle_trips
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- 3. RLS Policies (position_history)
-- =====================================================
-- Ensure users can read position history for their vehicles (required for Agent and detailed maps)

ALTER TABLE public.position_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own vehicle position history" ON public.position_history;

CREATE POLICY "Users can read own vehicle position history" ON public.position_history
    FOR SELECT USING (
        public.has_role(auth.uid(), 'admin')
        OR EXISTS (
            SELECT 1 FROM public.vehicle_assignments va
            JOIN public.profiles p ON p.id = va.profile_id
            WHERE va.device_id = position_history.device_id AND p.user_id = auth.uid()
        )
    );

-- =====================================================
-- 4. Recreate vehicle_daily_stats View
-- =====================================================

CREATE OR REPLACE VIEW public.vehicle_daily_stats WITH (security_invoker = true) AS
SELECT
    device_id,
    date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')::date as stat_date,
    count(*) as trip_count,
    coalesce(sum(distance_km), 0) as total_distance_km,
    coalesce(avg(distance_km), 0) as avg_distance_km,
    max(max_speed) as peak_speed,
    avg(avg_speed) as avg_speed,
    coalesce(sum(duration_seconds), 0) as total_duration_seconds,
    min(start_time) as first_trip_start,
    max(end_time) as last_trip_end
FROM public.vehicle_trips
-- We can filter by source if we want only GPS51 data, but user wants ALL data including legacy
-- WHERE source = 'gps51' 
GROUP BY device_id, date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')::date;
