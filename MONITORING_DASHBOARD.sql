-- =====================================================
-- PRODUCTION MONITORING DASHBOARD
-- Run this daily to monitor system health
-- =====================================================

-- =====================================================
-- 1. SYSTEM OVERVIEW
-- =====================================================
SELECT 
  '=== SYSTEM OVERVIEW ===' as section,
  '' as separator_1;

SELECT 
  'Retry Cron Job' as component,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM cron.job 
      WHERE command LIKE '%retry-failed-notifications%' 
      AND active = true
    ) THEN '✅ ACTIVE'
    ELSE '❌ INACTIVE'
  END as status,
  (SELECT schedule FROM cron.job WHERE command LIKE '%retry-failed-notifications%' AND active = true LIMIT 1) as schedule
UNION ALL
SELECT 
  'Edge Function Errors Table',
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'edge_function_errors')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END,
  NULL
UNION ALL
SELECT 
  'Proactive Events Table',
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proactive_vehicle_events')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END,
  NULL;

-- =====================================================
-- 2. CRON JOB EXECUTION STATUS (Last 24 Hours)
-- =====================================================
SELECT 
  '=== CRON JOB EXECUTION (Last 24 Hours) ===' as section,
  '' as separator_1;

WITH retry_job AS (
  SELECT jobid FROM cron.job 
  WHERE command LIKE '%retry-failed-notifications%' 
  AND active = true 
  ORDER BY jobid DESC 
  LIMIT 1
)
SELECT 
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE jrd.status = 'succeeded') as successful,
  COUNT(*) FILTER (WHERE jrd.status = 'failed') as failed,
  COUNT(*) FILTER (WHERE jrd.status = 'running') as running,
  MAX(jrd.start_time) as last_execution,
  ROUND(100.0 * COUNT(*) FILTER (WHERE jrd.status = 'succeeded') / NULLIF(COUNT(*), 0), 2) as success_rate_percent
FROM cron.job_run_details jrd
CROSS JOIN retry_job rj
WHERE jrd.jobid = rj.jobid
  AND jrd.start_time >= now() - INTERVAL '24 hours';

-- =====================================================
-- 3. NOTIFICATION SUCCESS RATE (Last 24 Hours)
-- =====================================================
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

-- =====================================================
-- 4. FAILED EVENTS STATUS
-- =====================================================
SELECT 
  '=== FAILED EVENTS STATUS ===' as section,
  '' as separator_1;

SELECT 
  COUNT(*) as total_failed_events,
  COUNT(*) FILTER (WHERE resolved = false AND retry_count < 3) as pending_retry,
  COUNT(*) FILTER (WHERE resolved = true) as resolved_count,
  COUNT(*) FILTER (WHERE resolved = false AND retry_count >= 3) as max_retries_reached,
  COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '24 hours') as failed_last_24h,
  AVG(retry_count)::NUMERIC(10,2) as avg_retry_count
FROM edge_function_errors;

-- =====================================================
-- 5. TOP FAILING EVENT TYPES (Last 7 Days)
-- =====================================================
SELECT 
  '=== TOP FAILING EVENT TYPES (Last 7 Days) ===' as section,
  '' as separator_1;

SELECT 
  pve.event_type,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE pve.notified = true) as successful,
  COUNT(*) FILTER (WHERE pve.notified = false) as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE pve.notified = true) / NULLIF(COUNT(*), 0), 2) as success_rate_percent
FROM proactive_vehicle_events pve
WHERE pve.created_at >= now() - INTERVAL '7 days'
GROUP BY pve.event_type
ORDER BY total_events DESC
LIMIT 10;

-- =====================================================
-- 6. RECENT ERRORS (Last 24 Hours)
-- =====================================================
SELECT 
  '=== RECENT ERRORS (Last 24 Hours) ===' as section,
  '' as separator_1;

SELECT 
  id,
  function_name,
  LEFT(error_message, 80) as error_preview,
  retry_count,
  resolved,
  created_at,
  last_retry_at,
  CASE 
    WHEN resolved = true THEN '✅ RESOLVED'
    WHEN retry_count >= 3 THEN '❌ MAX RETRIES'
    ELSE '⏳ PENDING RETRY'
  END as status
FROM edge_function_errors
WHERE created_at >= now() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- 7. SYSTEM HEALTH SCORE
-- =====================================================
SELECT 
  '=== SYSTEM HEALTH SCORE ===' as section,
  '' as separator_1;

WITH metrics AS (
  SELECT 
    -- Cron job active
    (SELECT COUNT(*) FROM cron.job WHERE command LIKE '%retry-failed-notifications%' AND active = true) as cron_active,
    
    -- Notification success rate (last 24h)
    (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE notified = true) / NULLIF(COUNT(*), 0), 2) 
     FROM proactive_vehicle_events 
     WHERE created_at >= now() - INTERVAL '24 hours') as notification_success_rate,
    
    -- Pending retries
    (SELECT COUNT(*) FROM edge_function_errors WHERE resolved = false AND retry_count < 3) as pending_retries,
    
    -- Max retries reached
    (SELECT COUNT(*) FROM edge_function_errors WHERE resolved = false AND retry_count >= 3) as max_retries
)
SELECT 
  CASE 
    WHEN metrics.cron_active > 0 
      AND metrics.notification_success_rate >= 95
      AND metrics.pending_retries < 10
      AND metrics.max_retries < 5
    THEN '✅ EXCELLENT - System healthy'
    
    WHEN metrics.cron_active > 0 
      AND metrics.notification_success_rate >= 90
      AND metrics.pending_retries < 50
      AND metrics.max_retries < 20
    THEN '✅ GOOD - System operating normally'
    
    WHEN metrics.cron_active > 0 
      AND metrics.notification_success_rate >= 80
    THEN '⚠️ WARNING - Some issues detected'
    
    WHEN metrics.cron_active = 0
    THEN '❌ CRITICAL - Cron job not active'
    
    ELSE '❌ CRITICAL - System issues detected'
  END as health_status,
  metrics.cron_active as cron_job_active,
  metrics.notification_success_rate as notification_success_rate_percent,
  metrics.pending_retries as pending_retries_count,
  metrics.max_retries as max_retries_count
FROM metrics;

-- =====================================================
-- 8. RECOMMENDATIONS
-- =====================================================
SELECT 
  '=== RECOMMENDATIONS ===' as section,
  '' as separator_1;

SELECT 
  CASE 
    WHEN (SELECT COUNT(*) FROM edge_function_errors WHERE resolved = false AND retry_count >= 3) > 10
    THEN '⚠️ Many events reached max retries. Review error messages and fix root cause.'
    
    WHEN (SELECT COUNT(*) FROM edge_function_errors WHERE resolved = false AND retry_count < 3) > 50
    THEN '⚠️ Many pending retries. System may be under load. Monitor closely.'
    
    WHEN (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE notified = true) / NULLIF(COUNT(*), 0), 2) 
          FROM proactive_vehicle_events 
          WHERE created_at >= now() - INTERVAL '24 hours') < 90
    THEN '⚠️ Notification success rate below 90%. Check edge function logs.'
    
    WHEN NOT EXISTS (SELECT 1 FROM cron.job WHERE command LIKE '%retry-failed-notifications%' AND active = true)
    THEN '❌ CRITICAL: Retry cron job not active. Fix immediately.'
    
    ELSE '✅ No immediate action required. System operating normally.'
  END as recommendation;
