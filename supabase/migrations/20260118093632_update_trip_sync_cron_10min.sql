-- Update trip sync cron job from 30 minutes to 10 minutes
-- This provides automatic data freshness every 10 minutes

-- Safely unschedule any existing trip sync jobs (15min or 30min)
-- Using DO block to handle cases where jobs might not exist
DO $$
BEGIN
  -- Try to unschedule 30-minute job (if it exists)
  BEGIN
    PERFORM cron.unschedule('auto-sync-trips-30min');
  EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist, that's fine - continue
    NULL;
  END;
  
  -- Try to unschedule 15-minute job (if it exists from earlier migration)
  BEGIN
    PERFORM cron.unschedule('auto-sync-trips-15min');
  EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist, that's fine - continue
    NULL;
  END;
END $$;

-- Schedule new 10-minute job (or update if it already exists)
SELECT cron.schedule(
  'auto-sync-trips-10min',
  '*/10 * * * *', -- Every 10 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sync-trips-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := jsonb_build_object(
        'force_full_sync', false
      )
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Schedules automatic trip synchronization every 10 minutes';
