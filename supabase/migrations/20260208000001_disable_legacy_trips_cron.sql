-- Disable the legacy 5-minute trip processor cron
-- This fixes the "POST | 410" errors in the logs caused by an old job trying to call the deprecated 'process-trips' function

DO $$
BEGIN
    -- Unschedule the 5-minute job if it exists
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-vehicle-trips') THEN
        PERFORM cron.unschedule('process-vehicle-trips');
    END IF;

    -- Double check and remove the hourly one too, just in case
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-trips-hourly') THEN
        PERFORM cron.unschedule('process-trips-hourly');
    END IF;
END $$;
