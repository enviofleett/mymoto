-- Create trip_patterns table to store learned driving habits
CREATE TABLE public.trip_patterns (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id TEXT NOT NULL,
    origin_latitude DOUBLE PRECISION NOT NULL,
    origin_longitude DOUBLE PRECISION NOT NULL,
    origin_name TEXT,
    destination_latitude DOUBLE PRECISION NOT NULL,
    destination_longitude DOUBLE PRECISION NOT NULL,
    destination_name TEXT,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    typical_start_hour INTEGER NOT NULL CHECK (typical_start_hour >= 0 AND typical_start_hour <= 23),
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    avg_duration_minutes NUMERIC,
    avg_distance_km NUMERIC,
    last_occurrence TIMESTAMP WITH TIME ZONE,
    confidence_score NUMERIC DEFAULT 0.5, -- 0.0 to 1.0
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(device_id, origin_latitude, origin_longitude, destination_latitude, destination_longitude, day_of_week, typical_start_hour)
);

-- Enable RLS
ALTER TABLE public.trip_patterns ENABLE ROW LEVEL SECURITY;

-- Admin can view all patterns
CREATE POLICY "Admins can view all trip patterns"
ON public.trip_patterns FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Users can view patterns for their assigned vehicles
CREATE POLICY "Users can view their vehicle patterns"
ON public.trip_patterns FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM vehicle_assignments va
        WHERE va.device_id = trip_patterns.device_id
        AND va.profile_id = auth.uid()
    )
);

-- Create index for efficient querying
CREATE INDEX idx_trip_patterns_device_day_hour ON public.trip_patterns(device_id, day_of_week, typical_start_hour);
CREATE INDEX idx_trip_patterns_lookup ON public.trip_patterns(device_id, day_of_week, typical_start_hour, occurrence_count);

-- Function to analyze and populate trip patterns from vehicle_trips
CREATE OR REPLACE FUNCTION public.analyze_trip_patterns()
RETURNS TABLE(patterns_created INTEGER, patterns_updated INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_created INTEGER := 0;
    v_updated INTEGER := 0;
    pattern_record RECORD;
    existing_id UUID;
BEGIN
    -- Analyze trips from the last 30 days, group by location clusters and time
    FOR pattern_record IN (
        SELECT 
            vt.device_id,
            -- Round coordinates to ~100m precision for clustering
            ROUND(vt.start_latitude::numeric, 3) AS origin_lat,
            ROUND(vt.start_longitude::numeric, 3) AS origin_lon,
            ROUND(vt.end_latitude::numeric, 3) AS dest_lat,
            ROUND(vt.end_longitude::numeric, 3) AS dest_lon,
            EXTRACT(DOW FROM vt.start_time)::INTEGER AS dow,
            EXTRACT(HOUR FROM vt.start_time)::INTEGER AS start_hour,
            COUNT(*) AS trip_count,
            AVG(vt.duration_minutes) AS avg_duration,
            AVG(vt.distance_km) AS avg_distance,
            MAX(vt.start_time) AS last_trip
        FROM vehicle_trips vt
        WHERE vt.start_time > NOW() - INTERVAL '30 days'
          AND vt.start_latitude IS NOT NULL
          AND vt.end_latitude IS NOT NULL
          AND vt.distance_km > 0.5  -- Ignore very short trips
        GROUP BY 
            vt.device_id,
            ROUND(vt.start_latitude::numeric, 3),
            ROUND(vt.start_longitude::numeric, 3),
            ROUND(vt.end_latitude::numeric, 3),
            ROUND(vt.end_longitude::numeric, 3),
            EXTRACT(DOW FROM vt.start_time)::INTEGER,
            EXTRACT(HOUR FROM vt.start_time)::INTEGER
        HAVING COUNT(*) >= 3  -- Only patterns with 3+ occurrences
    ) LOOP
        -- Check if pattern exists
        SELECT id INTO existing_id
        FROM trip_patterns tp
        WHERE tp.device_id = pattern_record.device_id
          AND ABS(tp.origin_latitude - pattern_record.origin_lat) < 0.002
          AND ABS(tp.origin_longitude - pattern_record.origin_lon) < 0.002
          AND ABS(tp.destination_latitude - pattern_record.dest_lat) < 0.002
          AND ABS(tp.destination_longitude - pattern_record.dest_lon) < 0.002
          AND tp.day_of_week = pattern_record.dow
          AND tp.typical_start_hour = pattern_record.start_hour
        LIMIT 1;
        
        IF existing_id IS NOT NULL THEN
            -- Update existing pattern
            UPDATE trip_patterns SET
                occurrence_count = pattern_record.trip_count,
                avg_duration_minutes = pattern_record.avg_duration,
                avg_distance_km = pattern_record.avg_distance,
                last_occurrence = pattern_record.last_trip,
                confidence_score = LEAST(1.0, pattern_record.trip_count::numeric / 10.0),
                updated_at = NOW()
            WHERE id = existing_id;
            v_updated := v_updated + 1;
        ELSE
            -- Insert new pattern
            INSERT INTO trip_patterns (
                device_id, origin_latitude, origin_longitude,
                destination_latitude, destination_longitude,
                day_of_week, typical_start_hour,
                occurrence_count, avg_duration_minutes, avg_distance_km,
                last_occurrence, confidence_score
            ) VALUES (
                pattern_record.device_id,
                pattern_record.origin_lat,
                pattern_record.origin_lon,
                pattern_record.dest_lat,
                pattern_record.dest_lon,
                pattern_record.dow,
                pattern_record.start_hour,
                pattern_record.trip_count,
                pattern_record.avg_duration,
                pattern_record.avg_distance,
                pattern_record.last_trip,
                LEAST(1.0, pattern_record.trip_count::numeric / 10.0)
            );
            v_created := v_created + 1;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_created, v_updated;
END;
$$;

-- Function to get predicted trips for a device in the next hour
CREATE OR REPLACE FUNCTION public.get_predicted_trips(p_device_id TEXT DEFAULT NULL)
RETURNS TABLE(
    pattern_id UUID,
    device_id TEXT,
    origin_latitude DOUBLE PRECISION,
    origin_longitude DOUBLE PRECISION,
    origin_name TEXT,
    destination_latitude DOUBLE PRECISION,
    destination_longitude DOUBLE PRECISION,
    destination_name TEXT,
    typical_start_hour INTEGER,
    occurrence_count INTEGER,
    avg_duration_minutes NUMERIC,
    avg_distance_km NUMERIC,
    confidence_score NUMERIC
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_dow INTEGER;
    current_hour INTEGER;
    next_hour INTEGER;
BEGIN
    current_dow := EXTRACT(DOW FROM NOW())::INTEGER;
    current_hour := EXTRACT(HOUR FROM NOW())::INTEGER;
    next_hour := (current_hour + 1) % 24;
    
    RETURN QUERY
    SELECT 
        tp.id AS pattern_id,
        tp.device_id,
        tp.origin_latitude,
        tp.origin_longitude,
        tp.origin_name,
        tp.destination_latitude,
        tp.destination_longitude,
        tp.destination_name,
        tp.typical_start_hour,
        tp.occurrence_count,
        tp.avg_duration_minutes,
        tp.avg_distance_km,
        tp.confidence_score
    FROM trip_patterns tp
    WHERE (p_device_id IS NULL OR tp.device_id = p_device_id)
      AND tp.day_of_week = current_dow
      AND tp.typical_start_hour IN (current_hour, next_hour)
      AND tp.occurrence_count >= 3
    ORDER BY tp.confidence_score DESC, tp.occurrence_count DESC;
END;
$$;

-- Function to get driving habits context for AI
CREATE OR REPLACE FUNCTION public.get_driving_habits_context(p_device_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    result JSON;
    current_dow INTEGER;
    current_hour INTEGER;
BEGIN
    current_dow := EXTRACT(DOW FROM NOW())::INTEGER;
    current_hour := EXTRACT(HOUR FROM NOW())::INTEGER;
    
    SELECT json_build_object(
        'current_day', to_char(NOW(), 'Day'),
        'current_hour', current_hour,
        'predicted_trip', (
            SELECT json_build_object(
                'destination_name', COALESCE(tp.destination_name, 'Unknown destination'),
                'destination_coords', json_build_object('lat', tp.destination_latitude, 'lon', tp.destination_longitude),
                'typical_duration_minutes', ROUND(tp.avg_duration_minutes::numeric, 0),
                'typical_distance_km', ROUND(tp.avg_distance_km::numeric, 1),
                'confidence', tp.confidence_score,
                'occurrences', tp.occurrence_count
            )
            FROM trip_patterns tp
            WHERE tp.device_id = p_device_id
              AND tp.day_of_week = current_dow
              AND tp.typical_start_hour = current_hour
            ORDER BY tp.confidence_score DESC
            LIMIT 1
        ),
        'frequent_destinations', (
            SELECT json_agg(dest)
            FROM (
                SELECT json_build_object(
                    'name', COALESCE(tp.destination_name, 'Location'),
                    'visits', tp.occurrence_count,
                    'typical_day', CASE tp.day_of_week
                        WHEN 0 THEN 'Sunday' WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
                        WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday' WHEN 5 THEN 'Friday'
                        ELSE 'Saturday' END,
                    'typical_hour', tp.typical_start_hour
                ) AS dest
                FROM trip_patterns tp
                WHERE tp.device_id = p_device_id
                ORDER BY tp.occurrence_count DESC
                LIMIT 5
            ) sub
        ),
        'total_patterns', (SELECT COUNT(*) FROM trip_patterns WHERE device_id = p_device_id)
    ) INTO result;
    
    RETURN result;
END;
$$;