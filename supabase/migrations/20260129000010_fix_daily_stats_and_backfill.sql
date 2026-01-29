-- Migration: Fix Daily Stats and Backfill Reports
-- Description:
-- 1. Updates get_daily_trip_stats to use the correct `vehicle_trips` view.
-- 2. Backfills existing daily_trip_reports with accurate data from the new view.

-- 1. Update Function to use vehicle_trips view
CREATE OR REPLACE FUNCTION public.get_daily_trip_stats(
    p_user_id UUID,
    p_date DATE
)
RETURNS TABLE (
    device_id TEXT,
    device_name TEXT,
    distance_km DECIMAL,
    duration_seconds INTEGER,
    trip_count INTEGER,
    max_speed DECIMAL
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH user_devices AS (
        SELECT v.device_id, v.device_name
        FROM vehicles v
        JOIN vehicle_assignments va ON v.device_id = va.device_id
        JOIN profiles p ON va.profile_id = p.id
        WHERE p.user_id = p_user_id
    ),
    daily_trips AS (
        SELECT 
            t.device_id,
            COALESCE(SUM(t.distance_km), 0) as total_dist,
            COALESCE(SUM(t.duration_seconds), 0) as total_dur,
            COUNT(*)::INTEGER as trips,
            MAX(t.max_speed) as top_speed
        FROM vehicle_trips t
        WHERE t.device_id IN (SELECT device_id FROM user_devices)
        AND t.start_time >= p_date::timestamp
        AND t.start_time < (p_date + 1)::timestamp
        GROUP BY t.device_id
    )
    SELECT 
        ud.device_id,
        ud.device_name,
        COALESCE(dt.total_dist, 0) as distance_km,
        COALESCE(dt.total_dur, 0) as duration_seconds,
        COALESCE(dt.trips, 0) as trip_count,
        COALESCE(dt.top_speed, 0) as max_speed
    FROM user_devices ud
    LEFT JOIN daily_trips dt ON ud.device_id = dt.device_id;
END;
$$;

-- 2. Backfill existing reports
DO $$
DECLARE
    r RECORD;
    stats RECORD;
BEGIN
    FOR r IN SELECT * FROM daily_trip_reports LOOP
        -- Calculate stats for this user and date
        WITH user_devices AS (
            SELECT v.device_id, v.device_name
            FROM vehicles v
            JOIN vehicle_assignments va ON v.device_id = va.device_id
            JOIN profiles p ON va.profile_id = p.id
            WHERE p.user_id = r.user_id
        ),
        daily_trips AS (
            SELECT 
                t.device_id,
                COALESCE(SUM(t.distance_km), 0) as total_dist,
                COALESCE(SUM(t.duration_seconds), 0) as total_dur,
                COUNT(*)::INTEGER as trips,
                MAX(t.max_speed) as top_speed
            FROM vehicle_trips t
            WHERE t.device_id IN (SELECT device_id FROM user_devices)
            AND t.start_time >= r.report_date::timestamp
            AND t.start_time < (r.report_date + 1)::timestamp
            GROUP BY t.device_id
        )
        SELECT
            COALESCE(SUM(total_dist), 0) as grand_total_dist,
            COALESCE(SUM(total_dur), 0) as grand_total_dur,
            COALESCE(SUM(trips), 0) as grand_total_trips,
            COALESCE(jsonb_object_agg(
                device_id, 
                jsonb_build_object(
                    'distance_km', total_dist,
                    'duration_seconds', total_dur,
                    'trip_count', trips,
                    'max_speed', top_speed
                )
            ), '{}'::jsonb) as metrics
        INTO stats
        FROM daily_trips;

        -- Update the report
        UPDATE daily_trip_reports
        SET
            total_distance_km = stats.grand_total_dist,
            total_duration_minutes = stats.grand_total_dur / 60,
            total_trips = stats.grand_total_trips,
            metrics = stats.metrics
        WHERE id = r.id;
        
    END LOOP;
END $$;
