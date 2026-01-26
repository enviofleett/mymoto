-- Verify CRON Jobs Are Working
-- Run this to check if the jobs are executing successfully

-- 1. Check job status (should show both as active)
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

-- 2. Check recent runs for sync-gps-data (should show "succeeded" status)
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

-- 3. Check recent runs for auto-sync-trips-staggered
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
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-sync-trips-staggered')
ORDER BY start_time DESC
LIMIT 10;

-- 4. Check when next runs are scheduled
SELECT 
  jobname,
  schedule,
  CASE 
    WHEN jobname = 'sync-gps-data' THEN 
      'Next runs: :00, :15, :30, :45 every hour'
    WHEN jobname = 'auto-sync-trips-staggered' THEN 
      'Next runs: :05, :20, :35, :50 every hour'
  END as next_runs_info
FROM cron.job
WHERE jobname IN ('sync-gps-data', 'auto-sync-trips-staggered')
ORDER BY jobname;

-- 5. Check latest vehicle position update times (to verify fresh data)
SELECT 
  device_id,
  gps_time,
  gps_fix_time,
  last_synced_at,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 as minutes_since_gps_update,
  EXTRACT(EPOCH FROM (NOW() - last_synced_at)) / 60 as minutes_since_sync,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 < 20 THEN '✅ FRESH'
    WHEN EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 < 60 THEN '⚠️ STALE'
    ELSE '❌ VERY STALE'
  END as data_freshness
FROM vehicle_positions
ORDER BY last_synced_at DESC NULLS LAST
LIMIT 10;
