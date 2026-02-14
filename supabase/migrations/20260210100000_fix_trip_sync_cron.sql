-- Fix Trip Sync Cron Job by using hardcoded values
-- Replaces usage of app.settings.* which may be missing

-- Enable http extension if not exists
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Unschedule existing job if any (safely)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-trips-15min');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not unschedule auto-sync-trips-15min: %', SQLERRM;
END $$;

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

-- Update trigger_trip_sync function to use http extension and hardcoded key
CREATE OR REPLACE FUNCTION trigger_trip_sync(p_device_id text DEFAULT NULL, p_force_full boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_url text := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental';
  v_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs';
  v_body jsonb;
  v_response extensions.http_response;
BEGIN
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

  -- Call Edge Function using pgsql-http extension
  SELECT * INTO v_response
  FROM extensions.http((
    'POST',
    v_url,
    ARRAY[extensions.http_header('Content-Type', 'application/json'), extensions.http_header('Authorization', 'Bearer ' || v_key)],
    'application/json',
    v_body::text
  )::extensions.http_request);

  -- Parse response
  IF v_response.status BETWEEN 200 AND 299 THEN
    BEGIN
      v_result := v_response.content::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_result := jsonb_build_object('success', true, 'raw_content', v_response.content);
    END;
  ELSE
    v_result := jsonb_build_object(
      'success', false,
      'status', v_response.status,
      'error', v_response.content
    );
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION trigger_trip_sync IS 'Manually trigger trip sync for a specific device or all devices (Fixed dependencies)';
