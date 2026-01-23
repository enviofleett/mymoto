-- Schedule Daily Billing Cron Job
-- This runs the billing-cron Edge Function daily at midnight UTC (1 AM WAT)
-- Charges users for LLM-enabled vehicles and disables LLM if balance is insufficient

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant pg_cron permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Unschedule existing billing cron if it exists
SELECT cron.unschedule('daily-llm-billing') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-llm-billing'
);

-- Schedule daily billing at midnight UTC (1 AM WAT)
SELECT cron.schedule(
  'daily-llm-billing',
  '0 0 * * *', -- Every day at midnight UTC (00:00 UTC = 01:00 WAT)
  $$
  SELECT
    net.http_post(
      url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/billing-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Verify the cron job was created
SELECT 
  jobname,
  schedule,
  command,
  active
FROM cron.job 
WHERE jobname = 'daily-llm-billing';

COMMENT ON EXTENSION pg_cron IS 'Schedules daily LLM billing at midnight UTC';
