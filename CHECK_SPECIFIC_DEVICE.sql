-- Check specific device data freshness
-- Replace '358657105966092' with your device ID if different

-- 1. Check vehicle position data for your device
SELECT 
  device_id,
  gps_time,
  gps_fix_time,
  last_synced_at,
  latitude,
  longitude,
  speed,
  is_online,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 as minutes_since_gps_update,
  EXTRACT(EPOCH FROM (NOW() - last_synced_at)) / 60 as minutes_since_sync,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 < 20 THEN '✅ FRESH'
    WHEN EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 < 60 THEN '⚠️ STALE'
    ELSE '❌ VERY STALE'
  END as data_freshness,
  CASE 
    WHEN is_online THEN '🟢 ONLINE'
    ELSE '🔴 OFFLINE'
  END as online_status
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- 2. Check if device exists in vehicles table
SELECT 
  device_id,
  device_name,
  gps_owner,
  created_at
FROM vehicles
WHERE device_id = '358657105966092';

-- 3. Check recent sync job runs for GPS data
SELECT 
  runid,
  status,
  start_time,
  end_time,
  CASE 
    WHEN status = 'succeeded' THEN '✅ SUCCESS'
    WHEN status = 'failed' THEN '❌ FAILED'
    WHEN status = 'running' THEN '⏳ RUNNING'
    ELSE '⏳ ' || status
  END as status_display,
  LEFT(return_message, 200) as message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
ORDER BY start_time DESC
LIMIT 5;

-- 4. Check Edge Function logs (if accessible)
-- Note: You'll need to check Supabase Dashboard → Edge Functions → gps-data → Logs
-- Look for entries around the last_synced_at time
