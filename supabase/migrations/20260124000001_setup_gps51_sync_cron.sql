-- Migration: GPS51 Data Sync Cron Jobs
-- Description: Sets up automatic synchronization of trips and alarms from GPS51 platform
-- Purpose: Ensure dashboard data stays in sync with GPS51 platform automatically

-- =====================================================
-- 1. Cron Job for GPS51 Trips Sync
-- =====================================================
-- Syncs trip data from GPS51 querytrips API every 10 minutes
-- This ensures trip reports match GPS51 platform 100%

SELECT cron.schedule(
  'sync-gps51-trips-all-vehicles',
  '*/10 * * * *', -- Every 10 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-gps51-trips',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := jsonb_build_object(
        'deviceid', device_id,
        'begintime', (now() - interval '7 days')::text,
        'endtime', now()::text,
        'timezone', 8
      )
    )
  FROM vehicles
  WHERE vehicle_status = 'active'
  LIMIT 100; -- Process 100 vehicles per run
  $$
);

-- =====================================================
-- 2. Cron Job for GPS51 Alarms Sync
-- =====================================================
-- Syncs alarm data from GPS51 position data every 5 minutes
-- This ensures alarm reports match GPS51 platform 100%

SELECT cron.schedule(
  'sync-gps51-alarms-all-vehicles',
  '*/5 * * * *', -- Every 5 minutes
  $$
  WITH active_devices AS (
    SELECT array_agg(device_id) AS deviceids
    FROM vehicles
    WHERE vehicle_status = 'active'
    LIMIT 100 -- Process 100 vehicles per run
  )
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-gps51-alarms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := jsonb_build_object(
        'deviceids', deviceids,
        'lastquerypositiontime', 0
      )
    )
  FROM active_devices;
  $$
);

-- =====================================================
-- 3. Store Supabase URL and Service Role Key in Settings
-- =====================================================
-- These are needed by cron jobs to call Edge Functions
-- NOTE: These will be set by the admin or deployment script

-- Create app_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Function to set app setting (use this in deployment)
CREATE OR REPLACE FUNCTION set_app_setting(p_key text, p_value text, p_metadata jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO app_settings (key, value, metadata)
  VALUES (p_key, p_value, p_metadata)
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      metadata = EXCLUDED.metadata,
      updated_at = now();
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION set_app_setting(text, text, jsonb) TO service_role;

-- =====================================================
-- 4. Manual Trigger Functions (for testing/debugging)
-- =====================================================

-- Function to manually trigger GPS51 trips sync for a device
CREATE OR REPLACE FUNCTION trigger_gps51_trips_sync(
  p_device_id text,
  p_days_back integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response jsonb;
BEGIN
  -- Call the Edge Function
  SELECT content::jsonb INTO v_response
  FROM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-gps51-trips',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
    ),
    body := jsonb_build_object(
      'deviceid', p_device_id,
      'begintime', (now() - (p_days_back || ' days')::interval)::text,
      'endtime', now()::text,
      'timezone', 8
    )
  );

  RETURN v_response;
END;
$$;

-- Function to manually trigger GPS51 alarms sync for devices
CREATE OR REPLACE FUNCTION trigger_gps51_alarms_sync(
  p_device_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response jsonb;
BEGIN
  -- Call the Edge Function
  SELECT content::jsonb INTO v_response
  FROM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-gps51-alarms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
    ),
    body := jsonb_build_object(
      'deviceids', p_device_ids,
      'lastquerypositiontime', 0
    )
  );

  RETURN v_response;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION trigger_gps51_trips_sync(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION trigger_gps51_alarms_sync(text[]) TO service_role;

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON FUNCTION trigger_gps51_trips_sync IS 'Manually trigger GPS51 trips sync for a specific device (for testing/debugging)';
COMMENT ON FUNCTION trigger_gps51_alarms_sync IS 'Manually trigger GPS51 alarms sync for specific devices (for testing/debugging)';

-- =====================================================
-- 5. Instructions for Setup
-- =====================================================
-- After migration, run these commands to set up app settings:
--
-- SELECT set_app_setting('supabase_url', 'https://your-project.supabase.co');
-- SELECT set_app_setting('supabase_service_role_key', 'your-service-role-key-here');
--
-- To manually test sync:
-- SELECT trigger_gps51_trips_sync('device_id_here', 7);
-- SELECT trigger_gps51_alarms_sync(ARRAY['device_id_1', 'device_id_2']);
--
-- To check cron job status:
-- SELECT * FROM cron.job WHERE jobname LIKE 'sync-gps51%';
--
-- To check sync status:
-- SELECT * FROM gps51_sync_status ORDER BY updated_at DESC;
