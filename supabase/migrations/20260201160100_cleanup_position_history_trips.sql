-- Migration: Cleanup Ghost Trips by Restoring Table Architecture
-- Description: 
-- 1. Safely drops vehicle_trips (handling both VIEW and TABLE scenarios).
-- 2. Recreates vehicle_trips as a TABLE (for 100% GPS51 Parity).
-- 3. Restores indexes and RLS policies.
-- 4. Recreates dependent views (vehicle_daily_stats).

-- 1. Robust Drop Logic (Handles both View and Table to avoid Error 42809)
DO $$
BEGIN
    -- Check if it's a VIEW and drop it
    IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'vehicle_trips') THEN
        DROP VIEW public.vehicle_trips CASCADE;
    END IF;

    -- Check if it's a TABLE and drop it
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vehicle_trips') THEN
        DROP TABLE public.vehicle_trips CASCADE;
    END IF;
END $$;

-- 2. Create vehicle_trips TABLE
CREATE TABLE public.vehicle_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    start_latitude DOUBLE PRECISION,
    start_longitude DOUBLE PRECISION,
    end_latitude DOUBLE PRECISION,
    end_longitude DOUBLE PRECISION,
    max_speed DOUBLE PRECISION,
    avg_speed DOUBLE PRECISION,
    source TEXT DEFAULT 'gps51',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Fuzzy search columns (preserving schema)
    start_location_name TEXT,
    end_location_name TEXT,
    start_address TEXT,
    end_address TEXT,
    start_district TEXT,
    end_district TEXT,
    start_poi_name TEXT,
    end_poi_name TEXT
);

-- 3. Create Indexes
CREATE INDEX idx_vehicle_trips_device_time ON public.vehicle_trips(device_id, start_time DESC);
CREATE INDEX idx_vehicle_trips_source ON public.vehicle_trips(source);
CREATE INDEX idx_vehicle_trips_fuzzy_start ON public.vehicle_trips USING GIN (start_location_name gin_trgm_ops);

-- 4. Enable RLS
ALTER TABLE public.vehicle_trips ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies
CREATE POLICY "Service role can manage all trips" ON public.vehicle_trips
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view assigned vehicle trips" ON public.vehicle_trips
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.vehicle_assignments va
            JOIN public.profiles p ON va.profile_id = p.id
            WHERE va.device_id = vehicle_trips.device_id
            AND p.user_id = auth.uid()
        )
    );

-- 6. Recreate vehicle_daily_stats VIEW (Dropped by CASCADE)
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
WHERE source = 'gps51'
GROUP BY device_id, date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')::date;

-- 7. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_trips;
ALTER TABLE public.vehicle_trips REPLICA IDENTITY FULL;
