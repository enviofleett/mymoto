-- Check full cron job details including the actual schedule string
SELECT 
  jobid,
  schedule,  -- This is the cron expression
  command,    -- This shows the actual SQL being run
  nodename,
  nodeport,
  database,
  username,
  active,
  jobname
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- The schedule column should show the cron expression like '*/5 * * * *'
-- If it shows a number, that's the jobid, not the schedule

-- Also check the command to see if use_cache is set correctly
-- Look for 'use_cache' in the command field
