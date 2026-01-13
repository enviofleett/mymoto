-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant pg_cron permissions to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule automatic trip sync every 15 minutes
-- This calls the sync-trips-incremental Edge Function
SELECT cron.schedule(
  'auto-sync-trips-15min',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-trips-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := jsonb_build_object(
        'force_full_sync', false
      )
    ) AS request_id;
  $$
);

-- Set the Supabase URL and service role key as database settings
-- These will be used by the cron job to call the Edge Function
-- Replace these values with your actual Supabase credentials
ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://cmvpnsqiefbsqkwnraka.supabase.co';

-- Note: The service role key should be set via the Supabase dashboard or CLI
-- For security, do NOT hardcode it in migrations
-- Set it via: ALTER DATABASE postgres SET "app.settings.supabase_service_role_key" = 'your-key-here';

COMMENT ON EXTENSION pg_cron IS 'Schedules automatic trip synchronization every 15 minutes';

-- Function to manually trigger trip sync for a specific device
CREATE OR REPLACE FUNCTION trigger_trip_sync(p_device_id text DEFAULT NULL, p_force_full boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_url text;
  v_body jsonb;
BEGIN
  -- Get Supabase URL from settings
  v_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sync-trips-incremental';

  -- Build request body
  IF p_device_id IS NOT NULL THEN
    v_body := jsonb_build_object(
      'device_ids', jsonb_build_array(p_device_id),
      'force_full_sync', p_force_full
    );
  ELSE
    v_body := jsonb_build_object(
      'force_full_sync', p_force_full
    );
  END IF;

  -- Call Edge Function
  SELECT content::jsonb INTO v_result
  FROM http_post(
    v_url,
    v_body::text,
    'application/json',
    jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
    )
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION trigger_trip_sync IS 'Manually trigger trip sync for a specific device or all devices';

-- View to check cron job status
CREATE OR REPLACE VIEW cron_job_status AS
SELECT
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobname
FROM cron.job
WHERE jobname LIKE '%trip%';

COMMENT ON VIEW cron_job_status IS 'View to monitor trip sync cron job status';
