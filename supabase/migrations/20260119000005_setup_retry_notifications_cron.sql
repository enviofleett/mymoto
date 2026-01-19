-- Set up cron job to retry failed notifications every 15 minutes
-- This migration creates a scheduled job to automatically retry failed proactive-alarm-to-chat calls

-- Ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant pg_cron permissions to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule automatic retry of failed notifications every 15 minutes
-- This calls the retry-failed-notifications Edge Function
SELECT cron.schedule(
  'retry-failed-notifications-15min',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/retry-failed-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := jsonb_build_object()
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Schedules automatic retry of failed notifications every 15 minutes';

-- Verify the cron job was created
-- Note: cron.job doesn't have a jobname column, so we identify by command text
SELECT 
  jobid,
  schedule,
  LEFT(command, 100) as command_preview,
  nodename,
  nodeport,
  database,
  username,
  active,
  CASE 
    WHEN command LIKE '%retry-failed-notifications%' THEN '✅ RETRY JOB FOUND'
    ELSE '⚠️ JOB NOT FOUND'
  END as status
FROM cron.job
WHERE command LIKE '%retry-failed-notifications%'
ORDER BY jobid DESC
LIMIT 1;
