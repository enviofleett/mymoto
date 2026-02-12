-- RESET_AND_CLEAN_DB.sql
-- WARNING: This will delete ALL tracking history and logs to free up space.
-- It does NOT delete users, vehicles, or settings.

BEGIN;

-- 1. Truncate heavy tracking tables
TRUNCATE TABLE position_history RESTART IDENTITY CASCADE;
TRUNCATE TABLE vehicle_trips RESTART IDENTITY CASCADE;
TRUNCATE TABLE gps51_trips RESTART IDENTITY CASCADE;

-- 2. Clean up log tables if they exist
DO $$ 
BEGIN 
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'email_logs') THEN 
        TRUNCATE TABLE email_logs RESTART IDENTITY CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ignition_detection_shadow_logs') THEN 
        TRUNCATE TABLE ignition_detection_shadow_logs RESTART IDENTITY CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'edge_function_logs') THEN 
        TRUNCATE TABLE edge_function_logs RESTART IDENTITY CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'debug_logs') THEN 
        TRUNCATE TABLE debug_logs RESTART IDENTITY CASCADE;
    END IF;
END $$;

COMMIT;

-- Verification
SELECT 
    'position_history' as table_name, count(*) as row_count FROM position_history
UNION ALL
SELECT 
    'vehicle_trips' as table_name, count(*) as row_count FROM vehicle_trips
UNION ALL
SELECT 
    'gps51_trips' as table_name, count(*) as row_count FROM gps51_trips;
