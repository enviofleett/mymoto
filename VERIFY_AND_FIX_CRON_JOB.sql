-- Complete fix for GPS sync cron job
-- This ensures it runs every 5 minutes and bypasses cache

-- Step 1: Unschedule existing job (if it exists)
SELECT cron.unschedule('sync-gps-data');

-- Step 2: Create new job with use_cache: false
SELECT cron.schedule(
  'sync-gps-data',
  '*/5 * * * *', -- Every 5 minutes (cron expression)
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
        'use_cache', false  -- CRITICAL: Force update, bypass cache
      )
    ) AS request_id;
  $$
);

-- Step 3: Verify the job was created correctly
SELECT 
  jobid,
  schedule,
  active,
  jobname,
  substring(command, 1, 200) as command_preview  -- Show first 200 chars of command
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- Expected result:
-- schedule should be: '*/5 * * * *'
-- active should be: true
-- command_preview should contain: 'use_cache', false
