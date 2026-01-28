-- Migration: Create Trip Patterns and Predictive Analysis Functions
-- Description: Adds the missing tables and RPC functions required by the predictive-briefing Edge Function.

-- 1. Create trip_patterns table
CREATE TABLE IF NOT EXISTS public.trip_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
    
    -- Origin Cluster Center
    origin_latitude DOUBLE PRECISION NOT NULL,
    origin_longitude DOUBLE PRECISION NOT NULL,
    origin_name TEXT,
    
    -- Destination Cluster Center
    destination_latitude DOUBLE PRECISION NOT NULL,
    destination_longitude DOUBLE PRECISION NOT NULL,
    destination_name TEXT,
    
    -- Time Context
    typical_start_hour INTEGER CHECK (typical_start_hour >= 0 AND typical_start_hour <= 23),
    time_of_day TEXT CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
    day_of_week INTEGER, -- 0-6 (Sunday-Saturday), NULL for daily
    
    -- Stats
    occurrence_count INTEGER DEFAULT 1,
    avg_duration_minutes NUMERIC(10, 1),
    avg_distance_km NUMERIC(10, 2),
    confidence_score NUMERIC(3, 2) DEFAULT 0.0,
    
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints to prevent duplicates for same pattern
    UNIQUE(device_id, typical_start_hour, origin_latitude, origin_longitude, destination_latitude, destination_longitude)
);

-- Enable RLS
ALTER TABLE public.trip_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages trip patterns"
ON public.trip_patterns FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users view own vehicle patterns"
ON public.trip_patterns FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.device_id = trip_patterns.device_id
    AND v.owner_id = auth.uid()
));

-- 2. Create RPC function to analyze trips and generate patterns
CREATE OR REPLACE FUNCTION analyze_trip_patterns()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    processed_count INTEGER := 0;
    pattern_count INTEGER := 0;
BEGIN
    -- This is a simplified clustering implementation
    -- In a real production scenario, you might use PostGIS clustering functions
    
    -- 1. Group recent trips (last 30 days) by approximate start/end locations (rounded to ~1km) and hour
    -- Rounding lat/lon to 2 decimal places is roughly 1.1km precision
    WITH recent_trips AS (
        SELECT 
            device_id,
            ROUND(start_latitude::numeric, 2) as start_lat,
            ROUND(start_longitude::numeric, 2) as start_lon,
            ROUND(end_latitude::numeric, 2) as end_lat,
            ROUND(end_longitude::numeric, 2) as end_lon,
            EXTRACT(HOUR FROM start_time)::INTEGER as start_hour,
            COUNT(*) as trip_count,
            AVG(distance_km) as avg_dist,
            AVG(duration_seconds) / 60 as avg_dur
        FROM vehicle_trips
        WHERE start_time > NOW() - INTERVAL '30 days'
        GROUP BY 
            device_id, 
            ROUND(start_latitude::numeric, 2), 
            ROUND(start_longitude::numeric, 2), 
            ROUND(end_latitude::numeric, 2), 
            ROUND(end_longitude::numeric, 2),
            EXTRACT(HOUR FROM start_time)::INTEGER
        HAVING COUNT(*) >= 3 -- Minimum 3 trips to form a pattern
    )
    INSERT INTO trip_patterns (
        device_id,
        origin_latitude,
        origin_longitude,
        destination_latitude,
        destination_longitude,
        typical_start_hour,
        time_of_day,
        occurrence_count,
        avg_distance_km,
        avg_duration_minutes,
        confidence_score,
        last_updated
    )
    SELECT
        device_id,
        start_lat,
        start_lon,
        end_lat,
        end_lon,
        start_hour,
        CASE 
            WHEN start_hour BETWEEN 5 AND 11 THEN 'morning'
            WHEN start_hour BETWEEN 12 AND 16 THEN 'afternoon'
            WHEN start_hour BETWEEN 17 AND 21 THEN 'evening'
            ELSE 'night'
        END,
        trip_count,
        avg_dist,
        avg_dur,
        LEAST(trip_count * 0.1, 0.95), -- Cap confidence at 0.95
        NOW()
    FROM recent_trips
    ON CONFLICT (device_id, typical_start_hour, origin_latitude, origin_longitude, destination_latitude, destination_longitude)
    DO UPDATE SET
        occurrence_count = EXCLUDED.occurrence_count,
        avg_distance_km = EXCLUDED.avg_distance_km,
        avg_duration_minutes = EXCLUDED.avg_duration_minutes,
        confidence_score = EXCLUDED.confidence_score,
        last_updated = NOW();
        
    GET DIAGNOSTICS pattern_count = ROW_COUNT;
    
    RETURN json_build_object(
        'status', 'success',
        'patterns_updated', pattern_count
    );
END;
$$;

-- 3. Create RPC function to get predicted trips for the current hour
CREATE OR REPLACE FUNCTION get_predicted_trips()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_hour INTEGER;
    predictions JSON;
BEGIN
    current_hour := EXTRACT(HOUR FROM NOW()); -- UTC hour
    
    -- Adjust for Lagos time (UTC+1) roughly, or just match typical_start_hour
    -- Assuming typical_start_hour in patterns is stored in local time (derived from trips)
    -- If trips are UTC, then patterns are UTC.
    -- Let's assume patterns are stored in the same timezone as extracted from trips.
    
    SELECT json_agg(
        json_build_object(
            'pattern_id', id,
            'device_id', device_id,
            'origin_latitude', origin_latitude,
            'origin_longitude', origin_longitude,
            'origin_name', origin_name,
            'destination_latitude', destination_latitude,
            'destination_longitude', destination_longitude,
            'destination_name', destination_name,
            'typical_start_hour', typical_start_hour,
            'occurrence_count', occurrence_count,
            'avg_duration_minutes', avg_duration_minutes,
            'avg_distance_km', avg_distance_km,
            'confidence_score', confidence_score
        )
    )
    INTO predictions
    FROM trip_patterns
    WHERE typical_start_hour = current_hour
    OR typical_start_hour = (current_hour + 1) % 24; -- Look ahead 1 hour
    
    RETURN COALESCE(predictions, '[]'::json);
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION analyze_trip_patterns TO service_role;
GRANT EXECUTE ON FUNCTION get_predicted_trips TO service_role;
