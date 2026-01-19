-- Schedule ACC Report Sync Cron Job
-- This will regularly fetch authoritative ACC state changes from GPS51
-- and populate the acc_state_history table

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant pg_cron permissions to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule ACC report sync daily at 2 AM (GMT+8)
-- This fetches ACC state changes for the previous 24 hours
SELECT cron.schedule(
  'sync-acc-report-daily',
  '0 2 * * *', -- Daily at 2 AM
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/gps-acc-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := jsonb_build_object(
        'device_ids', (
          SELECT array_agg(device_id)
          FROM vehicles
          WHERE device_id IS NOT NULL
        ),
        'start_time', (NOW() - INTERVAL '25 hours')::text,
        'end_time', (NOW() - INTERVAL '1 hour')::text
      )
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Schedules automatic ACC report synchronization daily at 2 AM';

-- Alternative: Schedule more frequently (every 6 hours)
-- Uncomment if you need more frequent ACC state updates
/*
SELECT cron.schedule(
  'sync-acc-report-6hourly',
  '0 */6 * * *', -- Every 6 hours
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/gps-acc-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := jsonb_build_object(
        'device_ids', (
          SELECT array_agg(device_id)
          FROM vehicles
          WHERE device_id IS NOT NULL
        ),
        'start_time', (NOW() - INTERVAL '7 hours')::text,
        'end_time', NOW()::text
      )
    ) AS request_id;
  $$
);
*/

-- Function to manually trigger ACC report sync for specific devices
CREATE OR REPLACE FUNCTION trigger_acc_report_sync(
  p_device_ids text[] DEFAULT NULL,
  p_start_time text DEFAULT NULL,
  p_end_time text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_url text;
  v_body jsonb;
  v_device_ids text[];
BEGIN
  -- Get Supabase URL from settings
  v_url := current_setting('app.settings.supabase_url', true);
  
  -- Use provided device IDs or get all devices
  IF p_device_ids IS NULL THEN
    SELECT array_agg(device_id) INTO v_device_ids
    FROM vehicles
    WHERE device_id IS NOT NULL;
  ELSE
    v_device_ids := p_device_ids;
  END IF;
  
  -- Build request body
  v_body := jsonb_build_object(
    'device_ids', v_device_ids,
    'start_time', COALESCE(p_start_time, (NOW() - INTERVAL '24 hours')::text),
    'end_time', COALESCE(p_end_time, NOW()::text)
  );
  
  -- Call edge function
  SELECT net.http_post(
    url := v_url || '/functions/v1/gps-acc-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
    ),
    body := v_body
  ) INTO v_result;
  
  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_result,
    'device_count', array_length(v_device_ids, 1),
    'start_time', v_body->>'start_time',
    'end_time', v_body->>'end_time'
  );
END;
$$;

COMMENT ON FUNCTION trigger_acc_report_sync IS 'Manually trigger ACC report sync for specific devices and time range';

-- Example usage:
-- SELECT trigger_acc_report_sync(); -- Sync all devices for last 24 hours
-- SELECT trigger_acc_report_sync(ARRAY['device1', 'device2']); -- Sync specific devices
-- SELECT trigger_acc_report_sync(ARRAY['device1'], '2026-01-01 00:00:00', '2026-01-02 00:00:00'); -- Custom time range
