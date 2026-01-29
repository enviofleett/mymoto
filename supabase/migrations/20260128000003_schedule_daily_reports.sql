-- Schedule daily trip reports at 06:00 UTC (07:00 Lagos time)
-- Uses pg_cron and pg_net to call the Edge Function

-- Ensure pg_cron is enabled (idempotent)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the job
SELECT cron.schedule(
  'generate-daily-reports-daily',
  '0 6 * * *', -- At 06:00 UTC daily
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-daily-reports',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Schedules daily trip report generation at 06:00 UTC';
