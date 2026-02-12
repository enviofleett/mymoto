-- Remove incremental trip sync artifacts (sync-trips-incremental + trip_sync_status)

-- Unschedule any legacy trip sync cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-15min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-30min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-10min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-staggered');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-v2');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Remove legacy helper function/view
DROP FUNCTION IF EXISTS trigger_trip_sync(text, boolean);
DROP VIEW IF EXISTS cron_job_status;

-- Remove legacy trip sync status helpers
DROP FUNCTION IF EXISTS public.initialize_trip_sync_status(text);
DROP FUNCTION IF EXISTS public.reset_stuck_sync_status(text);

-- Remove realtime publication entry if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'trip_sync_status'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE trip_sync_status';
  END IF;
END $$;

-- Drop legacy trip sync status table
DROP TABLE IF EXISTS public.trip_sync_status CASCADE;
