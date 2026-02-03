-- Migration: Fix Trip Sync Cron Jobs
-- Description: 
-- 1. Safely unschedules conflicting/redundant jobs if they exist.
-- 2. Resets trip_sync_status to force a re-sync of the last 7 days.

-- =====================================================
-- 1. Safely unschedule conflicting jobs
-- =====================================================

-- We select from cron.job to ensure we only try to unschedule if the job actually exists.
-- This prevents "could not find valid entry for job" errors.

SELECT cron.unschedule(jobid) 
FROM cron.job 
WHERE jobname = 'sync-gps51-trips-all-vehicles';

SELECT cron.unschedule(jobid) 
FROM cron.job 
WHERE jobname = 'auto-sync-trips-10min';

SELECT cron.unschedule(jobid) 
FROM cron.job 
WHERE jobname = 'auto-sync-trips-15min';

-- =====================================================
-- 2. Reset Sync Status to Trigger Backfill
-- =====================================================

-- Clearing this table will cause the sync-trips-incremental function 
-- to treat the next run as a "first run", triggering the 7-day backfill logic.
TRUNCATE TABLE public.trip_sync_status;
