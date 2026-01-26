-- Fix CRON Job by Recreating with Hardcoded Values
-- This avoids permission issues with ALTER DATABASE
-- Run this in Supabase SQL Editor

-- Step 1: Unschedule existing GPS51-related jobs
DO $$
BEGIN
  PERFORM cron.unschedule('sync-gps-data');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-staggered');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Step 2: Recreate sync-gps-data job with hardcoded URL and service role key
SELECT cron.schedule(
  'sync-gps-data',
  '0,15,30,45 * * * *', -- Every 15 minutes at :00, :15, :30, :45
  $$
  SELECT net.http_post(
    url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs'
    ),
    body := jsonb_build_object('action', 'lastposition', 'use_cache', true)
  ) AS request_id;
  $$
);

-- Step 2b: Recreate auto-sync-trips-staggered job with hardcoded values
-- This runs at :05, :20, :35, :50 (5 minutes after GPS sync)
SELECT cron.schedule(
  'auto-sync-trips-staggered',
  '5,20,35,50 * * * *', -- Every 15 minutes at :05, :20, :35, :50
  $$
  SELECT net.http_post(
    url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs'
    ),
    body := jsonb_build_object('force_full_sync', false)
  ) AS request_id;
  $$
);

-- Step 3: Verify both jobs were created successfully
SELECT 
  jobname,
  schedule,
  active,
  CASE 
    WHEN active THEN '✅ ACTIVE'
    ELSE '❌ INACTIVE'
  END as status
FROM cron.job
WHERE jobname IN ('sync-gps-data', 'auto-sync-trips-staggered')
ORDER BY jobname;

-- Step 4: Test the GPS sync job manually (optional - will trigger immediately)
-- Uncomment to test:
-- SELECT net.http_post(
--   url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs'
--   ),
--   body := jsonb_build_object('action', 'lastposition', 'use_cache', false)
-- ) AS request_id;

-- Step 5: Check recent CRON job runs for sync-gps-data
SELECT 
  runid,
  job_pid,
  status,
  start_time,
  end_time,
  CASE 
    WHEN status = 'succeeded' THEN '✅ SUCCESS'
    WHEN status = 'failed' THEN '❌ FAILED'
    ELSE '⏳ ' || status
  END as status_display,
  LEFT(return_message, 100) as error_preview
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
ORDER BY start_time DESC
LIMIT 5;

-- Step 6: Check recent CRON job runs for auto-sync-trips-staggered
SELECT 
  runid,
  job_pid,
  status,
  start_time,
  end_time,
  CASE 
    WHEN status = 'succeeded' THEN '✅ SUCCESS'
    WHEN status = 'failed' THEN '❌ FAILED'
    ELSE '⏳ ' || status
  END as status_display,
  LEFT(return_message, 100) as error_preview
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-sync-trips-staggered')
ORDER BY start_time DESC
LIMIT 5;
