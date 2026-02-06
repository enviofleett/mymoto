
-- VERIFY_TRIP_LOGIC.sql
-- Purpose: Verify Trip Report Accuracy and Continuity logic in the database

WITH trip_stats AS (
    SELECT
        id,
        device_id,
        start_time,
        end_time,
        distance_meters,
        duration_seconds,
        max_speed_kmh,
        start_location,
        end_location,
        -- Check for "Ghost Trips" (defined as < 500m AND < 3min)
        CASE 
            WHEN distance_meters < 500 AND duration_seconds < 180 THEN 'GHOST'
            ELSE 'VALID'
        END as trip_type,
        -- Get previous trip's end location to check continuity
        LAG(end_location) OVER (PARTITION BY device_id ORDER BY start_time) as prev_end_location
    FROM
        vehicle_trips
    WHERE
        start_time > NOW() - INTERVAL '7 days' -- Check recent trips
),
continuity_check AS (
    SELECT
        *,
        -- Calculate distance between previous end and current start (using simple Euclidean approx for speed, or just checking equality if points match exactly)
        -- Note: strict equality might fail due to GPS drift, but we look for large gaps.
        -- Here we just check if previous end exists.
        CASE 
            WHEN prev_end_location IS NULL THEN 'FIRST_TRIP'
            WHEN prev_end_location = start_location THEN 'PERFECT_MATCH'
            ELSE 'GAP_DETECTED' -- In a real geo-query we'd check ST_Distance, but text comparison works for exact matches
        END as continuity_status
    FROM
        trip_stats
)
SELECT
    -- Summary Metrics
    (SELECT COUNT(*) FROM vehicle_trips) as total_trips_count,
    (SELECT COUNT(*) FROM trip_stats WHERE trip_type = 'GHOST') as ghost_trips_detected,
    (SELECT COUNT(*) FROM continuity_check WHERE continuity_status = 'GAP_DETECTED') as continuity_gaps,
    
    -- Detail for recent verification
    json_agg(t) as recent_trip_samples
FROM (
    SELECT * FROM continuity_check ORDER BY start_time DESC LIMIT 5
) t;
