-- Reduce cron job frequency to prevent GPS51 API rate limit errors
-- This migration updates cron schedules to be less aggressive

-- Update GPS data sync from every 1 minute to every 5 minutes
-- This reduces API calls by 80%
SELECT cron.unschedule('sync-gps-data');

SELECT cron.schedule(
  'sync-gps-data',
  '*/5 * * * *', -- Every 5 minutes (was every 1 minute)
  $$
  SELECT
    net.http_post(
      url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := jsonb_build_object(
        'action', 'lastposition',
        'use_cache', true
      )
    ) AS request_id;
  $$
);

-- Update trip sync from every 15 minutes to every 30 minutes
-- This reduces API calls by 50%
SELECT cron.unschedule('auto-sync-trips-15min');

SELECT cron.schedule(
  'auto-sync-trips-30min',
  '*/30 * * * *', -- Every 30 minutes (was every 15 minutes)
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

COMMENT ON EXTENSION pg_cron IS 'Reduced frequency cron jobs to prevent GPS51 API rate limiting';
