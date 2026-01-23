-- Fix: Update cron job to bypass cache and force GPS51 API calls
-- The current cron job uses use_cache: true, which might be returning stale data

-- Unschedule existing job
SELECT cron.unschedule('sync-gps-data');

-- Reschedule with use_cache: false to force updates
SELECT cron.schedule(
  'sync-gps-data',
  '*/5 * * * *', -- Every 5 minutes
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
        'use_cache', false  -- Force update, bypass cache
      )
    ) AS request_id;
  $$
);

-- Verify the job was created
SELECT 
  jobid,
  schedule,
  active,
  jobname
FROM cron.job
WHERE jobname = 'sync-gps-data';
