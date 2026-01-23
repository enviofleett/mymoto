-- Manually trigger GPS sync to test if it works
-- This bypasses the cron job and directly calls the Edge Function

-- Option 1: Call Edge Function directly (requires service role key)
SELECT
  net.http_post(
    url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
    ),
    body := jsonb_build_object(
      'action', 'lastposition',
      'use_cache', false  -- Force GPS51 API call
    )
  ) AS request_id;

-- After running, wait 10-30 seconds, then check:
-- SELECT cached_at, EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_ago
-- FROM vehicle_positions
-- WHERE device_id = '358657105966092';
-- Should show < 1 minute if sync worked
