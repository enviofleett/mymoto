-- Disable the ghost trip generator cron (Safe Version)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-trips-hourly') THEN
        PERFORM cron.unschedule('process-trips-hourly');
    END IF;
END $$;
