-- Quick Verification: Check if GPS Sync is Now Set to 60 Seconds
-- Run this to confirm the fix worked

SELECT 
  jobname,
  schedule,
  active,
  CASE 
    WHEN schedule = '*/1 * * * *' AND active = true THEN '✅ SUCCESS: Every 60 seconds, ACTIVE'
    WHEN schedule = '*/1 * * * *' AND active = false THEN '⚠️ CONFIGURED but INACTIVE - check why'
    WHEN schedule = '0,15,30,45 * * * *' THEN '❌ STILL OLD: Every 15 minutes (fix not applied)'
    ELSE '❓ UNKNOWN: ' || schedule
  END as status
FROM cron.job 
WHERE jobname = 'sync-gps-data';

-- Check recent runs (should start showing runs every ~60 seconds)
SELECT 
  runid,
  status,
  start_time,
  CASE 
    WHEN status = 'succeeded' THEN '✅ SUCCESS'
    WHEN status = 'failed' THEN '❌ FAILED'
    ELSE '⏳ ' || status
  END as status_display,
  LEFT(return_message, 100) as message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
ORDER BY start_time DESC
LIMIT 5;
