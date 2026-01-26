-- Fix GPS Location Sync to Run Every 60 Seconds
-- Run this directly in Supabase SQL Editor to apply immediately

-- Step 1: Unschedule existing job
DO $$
BEGIN
  PERFORM cron.unschedule('sync-gps-data');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Step 2: Create new job with 60-second schedule
SELECT cron.schedule(
  'sync-gps-data',
  '*/1 * * * *', -- Every 60 seconds (1 minute)
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

-- Step 3: Verify it was created correctly
SELECT 
  jobname,
  schedule,
  active,
  CASE 
    WHEN schedule = '*/1 * * * *' AND active = true THEN '✅ CONFIGURED: Every 60 seconds'
    WHEN schedule = '*/1 * * * *' AND active = false THEN '⚠️ CONFIGURED but INACTIVE'
    ELSE '❌ NOT CONFIGURED CORRECTLY'
  END as status
FROM cron.job 
WHERE jobname = 'sync-gps-data';

-- Step 4: Check if job will run soon
SELECT 
  'Next run will be at the next minute mark (e.g., :00, :01, :02, etc.)' as info;
