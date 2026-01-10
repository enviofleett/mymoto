-- Drop existing function and recreate with fixed column reference
DROP FUNCTION IF EXISTS public.analyze_trip_patterns();

CREATE OR REPLACE FUNCTION public.analyze_trip_patterns()
RETURNS TABLE(
    patterns_found INTEGER,
    devices_analyzed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    pattern_record RECORD;
    pattern_count INTEGER := 0;
    device_count INTEGER := 0;
BEGIN
    -- Get unique devices
    SELECT COUNT(DISTINCT device_id) INTO device_count FROM vehicle_trips WHERE start_time > NOW() - INTERVAL '30 days';
    
    -- Analyze trips and insert/update patterns
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
            AVG(vt.duration_seconds / 60.0) AS avg_duration,  -- Convert seconds to minutes
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
    )
    LOOP
        -- Insert or update the pattern
        INSERT INTO trip_patterns (
            device_id,
            origin_lat,
            origin_lon,
            destination_lat,
            destination_lon,
            day_of_week,
            typical_start_hour,
            occurrence_count,
            avg_duration_minutes,
            avg_distance_km,
            last_occurrence,
            confidence_score
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
            LEAST(1.0, pattern_record.trip_count / 10.0)  -- Confidence based on frequency
        )
        ON CONFLICT (device_id, origin_lat, origin_lon, destination_lat, destination_lon, day_of_week, typical_start_hour)
        DO UPDATE SET
            occurrence_count = EXCLUDED.occurrence_count,
            avg_duration_minutes = EXCLUDED.avg_duration_minutes,
            avg_distance_km = EXCLUDED.avg_distance_km,
            last_occurrence = EXCLUDED.last_occurrence,
            confidence_score = EXCLUDED.confidence_score,
            updated_at = NOW();
        
        pattern_count := pattern_count + 1;
    END LOOP;
    
    patterns_found := pattern_count;
    devices_analyzed := device_count;
    
    RETURN NEXT;
END;
$$;