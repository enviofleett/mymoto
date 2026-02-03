-- ============================================================================
-- CRON JOB DIAGNOSTIC & STRESS TEST SUITE
-- ============================================================================
-- Run this script in the Supabase SQL Editor to verify cron job health.

-- ----------------------------------------------------------------------------
-- 1. CONFIGURATION CHECK
-- ----------------------------------------------------------------------------
-- Verify that 'auto-sync-trips-staggered' is scheduled and active.
-- Expected: One active job for trip sync (staggered or 10min).
SELECT 
    jobid, 
    jobname, 
    schedule, 
    active, 
    command 
FROM cron.job 
WHERE command LIKE '%sync-trips-incremental%';

-- ----------------------------------------------------------------------------
-- 2. EXECUTION HEALTH CHECK
-- ----------------------------------------------------------------------------
-- Check the last 20 executions. 
-- Look for 'failed' status or NULL return_message.
SELECT 
    runid, 
    jobid, 
    database, 
    status, 
    return_message, 
    start_time, 
    end_time,
    extract(epoch from (end_time - start_time)) as duration_seconds
FROM cron.job_run_details 
WHERE command LIKE '%sync-trips-incremental%'
ORDER BY start_time DESC 
LIMIT 20;

-- ----------------------------------------------------------------------------
-- 3. ERROR ANALYSIS
-- ----------------------------------------------------------------------------
-- Specifically filter for failed runs to diagnose issues.
SELECT * 
FROM cron.job_run_details 
WHERE command LIKE '%sync-trips-incremental%' 
AND status != 'succeeded'
ORDER BY start_time DESC;

-- ----------------------------------------------------------------------------
-- 4. DATA SYNC VERIFICATION
-- ----------------------------------------------------------------------------
-- Check if trip_sync_status is being updated.
-- If the cron is working, 'updated_at' should be very recent for active vehicles.
SELECT * 
FROM trip_sync_status 
ORDER BY updated_at DESC 
LIMIT 10;

-- ----------------------------------------------------------------------------
-- 5. MANUAL INVOCATION (IMMEDIATE TEST)
-- ----------------------------------------------------------------------------
-- Manually trigger the Edge Function from SQL to verify connectivity and permissions.
-- This bypasses the scheduler to test the execution logic itself.
SELECT
  net.http_post(
    url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs'
    ),
    body := jsonb_build_object(
      'force_full_sync', false
    )
  ) AS manual_trigger_result;

-- ----------------------------------------------------------------------------
-- 6. STRESS TEST (TEMPORARY 1-MINUTE JOB)
-- ----------------------------------------------------------------------------
-- UNCOMMENT the block below to schedule a job that runs EVERY MINUTE.
-- Monitor this for 5-10 minutes to ensure stability, then UNSCHEDULE it.
/*
SELECT cron.schedule(
  'stress-test-sync-1min',
  '* * * * *', -- Runs every minute
  $$
  SELECT
    net.http_post(
      url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs'
      ),
      body := jsonb_build_object(
        'force_full_sync', false
      )
    ) AS request_id;
  $$
);
*/

-- TO CLEAN UP STRESS TEST:
-- SELECT cron.unschedule('stress-test-sync-1min');
