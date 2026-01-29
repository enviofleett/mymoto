-- Run GPS51 sync every minute with centralized rate limiting
-- Uses hardcoded Supabase URL and service role key to avoid permission issues
-- WARNING: Monitor gps_api_logs for rate limit errors (8902); rollback if needed.

DO $$
BEGIN
  PERFORM cron.unschedule('sync-gps-data');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sync-gps-data',
  '*/1 * * * *',
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

-- Safety checks: Verify job was created
SELECT 
  jobname, 
  schedule, 
  active,
  CASE 
    WHEN schedule = '*/1 * * * *' AND active = true THEN '✅ CONFIGURED: Every 60 seconds'
    ELSE '⚠️ CHECK CONFIGURATION'
  END as status
FROM cron.job 
WHERE jobname = 'sync-gps-data';

-- Optional: manually trigger once (uncomment to run)
-- SELECT net.http_post(
--   url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs'
--   ),
--   body := jsonb_build_object('action', 'lastposition', 'use_cache', false)
-- ) AS request_id;

