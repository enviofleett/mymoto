-- Fix GPS sync cron job to force updates (bypass cache)
-- The current job uses use_cache: true which prevents database updates

-- Step 1: Unschedule the existing job
SELECT cron.unschedule('sync-gps-data');

-- Step 2: Create new job that bypasses cache
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
        'use_cache', false  -- CRITICAL: Force GPS51 API call, bypass cache
      )
    ) AS request_id;
  $$
);

-- Step 3: Verify the job
SELECT 
  jobid,
  schedule,
  active,
  jobname
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- Expected: schedule = '*/5 * * * *', active = true

-- Step 4: Check the command contains use_cache: false
SELECT 
  jobname,
  CASE 
    WHEN command LIKE '%use_cache%false%' THEN '✅ Cache bypass enabled'
    WHEN command LIKE '%use_cache%true%' THEN '❌ Cache enabled (will prevent updates)'
    ELSE '⚠️ use_cache not found in command'
  END as cache_status
FROM cron.job
WHERE jobname = 'sync-gps-data';
