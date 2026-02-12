-- Update Trip Sync Cron Job to 5 minutes frequency

-- Unschedule existing job (v2) safely
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-v2');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not unschedule auto-sync-trips-v2: %', SQLERRM;
END $$;

-- Schedule automatic trip sync every 5 minutes
SELECT cron.schedule(
  'auto-sync-trips-v2',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental',
      jsonb_build_object('force_full_sync', false),
      '{}'::jsonb,
      jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs'
      )
    ) AS request_id;
  $$
);
