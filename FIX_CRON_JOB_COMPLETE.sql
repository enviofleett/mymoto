-- Complete fix for GPS sync cron job
-- This will force updates by bypassing cache

-- Step 1: Unschedule the existing job
SELECT cron.unschedule('sync-gps-data');

-- Step 2: Create new job with use_cache: false to force GPS51 API calls
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

-- Step 3: Verify the job was created
SELECT 
  jobid,
  jobname,
  active,
  -- Check if use_cache is false in the command
  CASE 
    WHEN command LIKE '%"use_cache"%false%' OR command LIKE '%use_cache%false%' THEN '✅ Cache bypass enabled'
    WHEN command LIKE '%"use_cache"%true%' OR command LIKE '%use_cache%true%' THEN '❌ Cache enabled (will prevent updates)'
    ELSE '⚠️ use_cache not found'
  END as cache_status,
  -- Show command preview to verify
  substring(command, 1, 300) as command_preview
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- Expected result:
-- active = true
-- cache_status = '✅ Cache bypass enabled'
-- command_preview should contain 'use_cache', false
