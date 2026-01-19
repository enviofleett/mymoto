-- =====================================================
-- RETRY SYSTEM MONITORING QUERIES
-- Run these daily to monitor the retry system health
-- =====================================================

-- 1. ✅ CHECK CRON JOB STATUS
SELECT 
  '=== CRON JOB STATUS ===' as section,
  '' as separator_1;

SELECT 
  jobid,
  schedule,
  LEFT(command, 80) as command_preview,
  active,
  CASE 
    WHEN active = true THEN '✅ ACTIVE'
    ELSE '❌ INACTIVE'
  END as status
FROM cron.job
WHERE command LIKE '%retry-failed-notifications%'
ORDER BY jobid DESC;

-- 2. ✅ CHECK RECENT CRON JOB EXECUTIONS (Last 24 Hours)
-- Note: We need to get the jobid first, then query job_run_details
SELECT 
  '=== RECENT EXECUTIONS (Last 24 Hours) ===' as section,
  '' as separator_1;

WITH retry_job AS (
  SELECT jobid 
  FROM cron.job 
  WHERE command LIKE '%retry-failed-notifications%' 
  ORDER BY jobid DESC 
  LIMIT 1
)
SELECT 
  jrd.runid,
  jrd.jobid,
  jrd.status,
  jrd.return_message,
  jrd.start_time,
  jrd.end_time,
  EXTRACT(EPOCH FROM (jrd.end_time - jrd.start_time))::INTEGER as duration_seconds,
  CASE 
    WHEN jrd.status = 'succeeded' THEN '✅ SUCCESS'
    WHEN jrd.status = 'failed' THEN '❌ FAILED'
    WHEN jrd.status = 'running' THEN '⏳ RUNNING'
    ELSE '⚠️ ' || jrd.status
  END as status_display
FROM cron.job_run_details jrd
CROSS JOIN retry_job rj
WHERE jrd.jobid = rj.jobid
  AND jrd.start_time >= now() - INTERVAL '24 hours'
ORDER BY jrd.start_time DESC
LIMIT 20;

-- 3. ✅ CHECK FAILED EVENTS STATUS
SELECT 
  '=== FAILED EVENTS STATUS ===' as section,
  '' as separator_1;

SELECT 
  COUNT(*) as total_failed_events,
  COUNT(*) FILTER (WHERE resolved = false AND retry_count < 3) as pending_retry,
  COUNT(*) FILTER (WHERE resolved = true) as resolved_count,
  COUNT(*) FILTER (WHERE retry_count >= 3 AND resolved = false) as max_retries_reached,
  COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '24 hours') as failed_last_24h
FROM edge_function_errors;

-- 4. ✅ DETAILED FAILED EVENTS (Pending Retry)
SELECT 
  '=== PENDING RETRY EVENTS ===' as section,
  '' as separator_1;

SELECT 
  id,
  function_name,
  event_id,
  device_id,
  LEFT(error_message, 100) as error_preview,
  retry_count,
  resolved,
  created_at,
  last_retry_at,
  CASE 
    WHEN resolved = true THEN '✅ RESOLVED'
    WHEN retry_count >= 3 THEN '❌ MAX RETRIES REACHED'
    WHEN last_retry_at IS NULL THEN '⏳ NEVER RETRIED'
    ELSE '⏳ PENDING RETRY (' || retry_count || '/3)'
  END as status
FROM edge_function_errors
WHERE resolved = false
  AND retry_count < 3
ORDER BY created_at DESC
LIMIT 20;

-- 5. ✅ NOTIFICATION SUCCESS RATE (Last 24 Hours)
SELECT 
  '=== NOTIFICATION SUCCESS RATE (Last 24 Hours) ===' as section,
  '' as separator_1;

SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE notified = true) as notified_successfully,
  COUNT(*) FILTER (WHERE notified = false) as pending_notification,
  ROUND(100.0 * COUNT(*) FILTER (WHERE notified = true) / NULLIF(COUNT(*), 0), 2) as success_rate_percent,
  COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '1 hour') as events_last_hour
FROM proactive_vehicle_events
WHERE created_at >= now() - INTERVAL '24 hours';

-- 6. ✅ NOTIFICATION SUCCESS RATE BY EVENT TYPE (Last 24 Hours)
SELECT 
  '=== SUCCESS RATE BY EVENT TYPE (Last 24 Hours) ===' as section,
  '' as separator_1;

SELECT 
  event_type,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE notified = true) as successful,
  COUNT(*) FILTER (WHERE notified = false) as pending,
  ROUND(100.0 * COUNT(*) FILTER (WHERE notified = true) / NULLIF(COUNT(*), 0), 2) as success_rate_percent
FROM proactive_vehicle_events
WHERE created_at >= now() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY total_events DESC;

-- 7. ✅ RETRY STATISTICS (Last 7 Days)
SELECT 
  '=== RETRY STATISTICS (Last 7 Days) ===' as section,
  '' as separator_1;

SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_failed,
  COUNT(*) FILTER (WHERE resolved = true) as resolved,
  COUNT(*) FILTER (WHERE resolved = false AND retry_count < 3) as still_pending,
  COUNT(*) FILTER (WHERE retry_count >= 3) as max_retries,
  ROUND(100.0 * COUNT(*) FILTER (WHERE resolved = true) / NULLIF(COUNT(*), 0), 2) as resolution_rate_percent,
  AVG(retry_count)::NUMERIC(10,2) as avg_retry_count
FROM edge_function_errors
WHERE created_at >= now() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 8. ✅ SUMMARY - SYSTEM HEALTH
SELECT 
  '=== SYSTEM HEALTH SUMMARY ===' as section,
  '' as separator_1;

SELECT 
  (SELECT COUNT(*) FROM cron.job WHERE command LIKE '%retry-failed-notifications%' AND active = true) as cron_job_active,
  (SELECT COUNT(*) FROM cron.job_run_details jrd 
   JOIN cron.job j ON jrd.jobid = j.jobid 
   WHERE j.command LIKE '%retry-failed-notifications%' 
   AND jrd.status = 'succeeded' 
   AND jrd.start_time >= now() - INTERVAL '24 hours') as successful_runs_24h,
  (SELECT COUNT(*) FROM cron.job_run_details jrd 
   JOIN cron.job j ON jrd.jobid = j.jobid 
   WHERE j.command LIKE '%retry-failed-notifications%' 
   AND jrd.status = 'failed' 
   AND jrd.start_time >= now() - INTERVAL '24 hours') as failed_runs_24h,
  (SELECT COUNT(*) FROM edge_function_errors WHERE resolved = false AND retry_count < 3) as pending_retries,
  (SELECT COUNT(*) FROM edge_function_errors WHERE resolved = false AND retry_count >= 3) as max_retries_reached,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE notified = true) / NULLIF(COUNT(*), 0), 2) FROM proactive_vehicle_events WHERE created_at >= now() - INTERVAL '24 hours') as notification_success_rate_24h,
  CASE 
    WHEN (SELECT COUNT(*) FROM cron.job WHERE command LIKE '%retry-failed-notifications%' AND active = true) > 0 
      AND (SELECT COUNT(*) FROM edge_function_errors WHERE resolved = false AND retry_count >= 3) < 10
    THEN '✅ HEALTHY'
    WHEN (SELECT COUNT(*) FROM edge_function_errors WHERE resolved = false AND retry_count >= 3) >= 10
    THEN '⚠️ WARNING - Many max retries reached'
    ELSE '❌ ISSUE - Cron job not active'
  END as overall_status;
