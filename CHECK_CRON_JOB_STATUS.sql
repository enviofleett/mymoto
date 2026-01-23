-- Check if the GPS sync cron job is scheduled and running
-- This will help identify why updates aren't happening

-- Check if cron job exists
SELECT 
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobname
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- If no rows returned, the cron job doesn't exist
-- If active = false, the job is disabled

-- Check cron job execution history (last 10 runs)
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
ORDER BY start_time DESC
LIMIT 10;

-- Check if service role key is configured
SELECT 
  name,
  setting,
  source
FROM pg_settings
WHERE name LIKE '%supabase_service_role_key%' OR name LIKE '%service_role%';

-- If service_role_key is not set, the cron job will fail silently
-- Set it via: ALTER DATABASE postgres SET "app.settings.supabase_service_role_key" = 'your-key-here';
