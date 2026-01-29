-- Stagger GPS51 cron jobs: gps-data and sync-trips-incremental never run in the same minute.
-- Reduces burst load on GPS51 API (178.62.14.85) and helps avoid IP limit (8902).
--
-- Schedule:
--   gps-data:            :00, :15, :30, :45 (every 15 min)
--   sync-trips-incremental: :05, :20, :35, :50 (every 15 min, offset 5 min)
--
-- Note: pg_cron is managed by Supabase. Do NOT add CREATE EXTENSION or GRANTs here.

-- Unschedule any existing GPS51-related jobs (safe per-job blocks)
DO $$
BEGIN
  PERFORM cron.unschedule('sync-gps-data');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-30min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-10min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-staggered');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- gps-data: run at :00, :15, :30, :45 (every 15 min)
SELECT cron.schedule(
  'sync-gps-data',
  '0,15,30,45 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/gps-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
    ),
    body := jsonb_build_object('action', 'lastposition', 'use_cache', true)
  ) AS request_id;
  $$
);

-- sync-trips-incremental: run at :05, :20, :35, :50 (every 15 min, staggered 5 min after gps-data)
SELECT cron.schedule(
  'auto-sync-trips-staggered',
  '5,20,35,50 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sync-trips-incremental',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
    ),
    body := jsonb_build_object('force_full_sync', false)
  ) AS request_id;
  $$
);
