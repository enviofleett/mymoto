-- Fix CRON Job by using hardcoded values instead of database settings
-- This avoids permission issues with ALTER DATABASE
-- Run this in Supabase SQL Editor

-- Unschedule existing sync-gps-data job
DO $$
BEGIN
  PERFORM cron.unschedule('sync-gps-data');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Recreate sync-gps-data job with hardcoded URL and service role key
-- IMPORTANT: Replace the service_role_key below with your actual key from Supabase Dashboard
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

-- Verify the job was created
SELECT 
  jobname,
  schedule,
  active,
  CASE 
    WHEN active THEN '✅ ACTIVE'
    ELSE '❌ INACTIVE'
  END as status
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- Test the job manually (optional - will trigger immediately)
-- Uncomment the line below to test:
-- SELECT net.http_post(
--   url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs'
--   ),
--   body := jsonb_build_object('action', 'lastposition', 'use_cache', false)
-- ) AS request_id;
