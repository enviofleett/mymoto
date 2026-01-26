-- Verify CRON Job is Set to Refresh Live Location Every 60 Seconds
-- Run this to confirm the setup is correct

-- 1. Check CRON job configuration
SELECT 
  jobname,
  schedule,
  active,
  CASE 
    WHEN schedule = '*/1 * * * *' THEN '✅ EVERY 60 SECONDS (1 minute)'
    WHEN schedule = '0,15,30,45 * * * *' THEN '⚠️ EVERY 15 MINUTES (old schedule)'
    WHEN schedule = '*/5 * * * *' THEN '⚠️ EVERY 5 MINUTES'
    ELSE '❓ UNKNOWN: ' || schedule
  END as schedule_status,
  CASE 
    WHEN active THEN '✅ ACTIVE'
    ELSE '❌ INACTIVE'
  END as active_status
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- 2. Check recent runs (should show runs every ~60 seconds if working)
SELECT 
  runid,
  status,
  start_time,
  end_time,
  CASE 
    WHEN status = 'succeeded' THEN '✅ SUCCESS'
    WHEN status = 'failed' THEN '❌ FAILED'
    WHEN status = 'running' THEN '⏳ RUNNING'
    ELSE '⏳ ' || status
  END as status_display,
  CASE 
    WHEN end_time IS NOT NULL THEN 
      ROUND(EXTRACT(EPOCH FROM (end_time - start_time))::numeric, 2) || ' seconds'
    ELSE 'Still running...'
  END as duration,
  LEFT(return_message, 150) as message_preview
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
ORDER BY start_time DESC
LIMIT 10;

-- 3. Calculate time between runs (should be ~60 seconds)
SELECT 
  runid,
  start_time,
  LAG(start_time) OVER (ORDER BY start_time DESC) as previous_run,
  CASE 
    WHEN LAG(start_time) OVER (ORDER BY start_time DESC) IS NOT NULL THEN
      ROUND(EXTRACT(EPOCH FROM (start_time - LAG(start_time) OVER (ORDER BY start_time DESC)))::numeric, 0) || ' seconds'
    ELSE 'First run'
  END as time_since_previous_run
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
  AND status = 'succeeded'
ORDER BY start_time DESC
LIMIT 10;

-- 4. Check vehicle position freshness (for your specific device)
SELECT 
  device_id,
  gps_time,
  gps_fix_time,
  last_synced_at,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 as minutes_since_gps_update,
  EXTRACT(EPOCH FROM (NOW() - last_synced_at)) / 60 as minutes_since_sync,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - last_synced_at) / 60) < 2 THEN '✅ VERY FRESH (< 2 min)'
    WHEN EXTRACT(EPOCH FROM (NOW() - last_synced_at) / 60) < 5 THEN '✅ FRESH (< 5 min)'
    WHEN EXTRACT(EPOCH FROM (NOW() - last_synced_at) / 60) < 15 THEN '⚠️ STALE (5-15 min)'
    ELSE '❌ VERY STALE (> 15 min)'
  END as sync_freshness,
  CASE 
    WHEN is_online THEN '🟢 ONLINE'
    ELSE '🔴 OFFLINE'
  END as online_status
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- 5. Check for rate limit errors in recent runs
SELECT 
  COUNT(*) as rate_limit_errors,
  MAX(start_time) as last_error_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
  AND return_message LIKE '%8902%'
  AND start_time > NOW() - INTERVAL '1 hour';

-- 6. Summary: Is CRON working correctly?
SELECT 
  CASE 
    WHEN (SELECT schedule FROM cron.job WHERE jobname = 'sync-gps-data') = '*/1 * * * *' 
         AND (SELECT active FROM cron.job WHERE jobname = 'sync-gps-data') = true
         AND (SELECT COUNT(*) FROM cron.job_run_details 
              WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
              AND status = 'succeeded' 
              AND start_time > NOW() - INTERVAL '5 minutes') > 0
    THEN '✅ CRON IS WORKING: Set to 60 seconds, active, and has successful runs'
    WHEN (SELECT schedule FROM cron.job WHERE jobname = 'sync-gps-data') = '*/1 * * * *'
         AND (SELECT active FROM cron.job WHERE jobname = 'sync-gps-data') = true
    THEN '⚠️ CRON IS CONFIGURED: Set to 60 seconds and active, but no recent successful runs'
    ELSE '❌ CRON NOT CONFIGURED: Check schedule and active status'
  END as cron_status;
