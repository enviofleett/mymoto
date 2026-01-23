-- Check full cron job details to see what's actually configured
-- The schedule column might be showing jobid instead of cron expression

-- Method 1: Check all columns
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

-- Method 2: Check if schedule is actually the cron expression or jobid
-- If schedule is a number, it might be the jobid - check the command instead
SELECT 
  jobname,
  jobid,
  schedule,
  active,
  -- Extract use_cache value from command
  CASE 
    WHEN command LIKE '%"use_cache"%false%' THEN 'false (good - will force updates)'
    WHEN command LIKE '%"use_cache"%true%' THEN 'true (bad - uses cache)'
    WHEN command LIKE '%use_cache%false%' THEN 'false (good)'
    WHEN command LIKE '%use_cache%true%' THEN 'true (bad)'
    ELSE 'not found in command'
  END as cache_setting,
  -- Show part of command to verify
  substring(command, 1, 500) as command_preview
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- Method 3: Check cron.job_run_details to see recent executions
SELECT 
  jobid,
  status,
  return_message,
  start_time,
  end_time,
  EXTRACT(EPOCH FROM (end_time - start_time)) AS duration_seconds
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
ORDER BY start_time DESC
LIMIT 5;
