-- =====================================================
-- QUICK CHECK: RETRY CRON JOB STATUS
-- Simple query to verify retry cron job is active
-- =====================================================

-- Check if retry cron job exists and is active
SELECT 
  jobid,
  schedule,
  LEFT(command, 100) as command_preview,
  active,
  CASE 
    WHEN command LIKE '%retry-failed-notifications%' AND active = true THEN '✅ RETRY JOB ACTIVE'
    WHEN command LIKE '%retry-failed-notifications%' AND active = false THEN '⚠️ RETRY JOB INACTIVE'
    ELSE '❌ RETRY JOB NOT FOUND'
  END as status
FROM cron.job
WHERE command LIKE '%retry-failed-notifications%'
ORDER BY jobid DESC
LIMIT 1;

-- If you know the jobid (e.g., 15), you can also check directly:
-- SELECT * FROM cron.job WHERE jobid = 15;
