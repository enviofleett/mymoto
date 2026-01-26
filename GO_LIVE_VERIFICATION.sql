-- Go-Live Verification: GPS51 Trip Sync + 8902 Mitigations
-- Run in Supabase SQL Editor. Use results to complete GO_LIVE_CHECKLIST.md

-- 1. Cron jobs (expected: sync-gps-data at :00/:15/:30/:45, auto-sync-trips-staggered at :05/:20/:35/:50)
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('sync-gps-data', 'auto-sync-trips-staggered')
ORDER BY jobname;

-- 2. Trip sync errors (ideally 0 rows; if any, run RESET_TRIP_SYNC_ERRORS_AFTER_8902.sql then recheck)
SELECT COUNT(*) AS error_count,
       COUNT(*) FILTER (WHERE error_message ILIKE '%8902%' OR error_message ILIKE '%ip limit%') AS ip_limit_count
FROM trip_sync_status
WHERE sync_status = 'error';

-- 3. Sample of devices in error (if any)
SELECT device_id, sync_status, error_message, updated_at
FROM trip_sync_status
WHERE sync_status = 'error'
ORDER BY updated_at DESC
LIMIT 10;

-- 4. GPS51 / rate-limit config (gps_token required for sync; gps51_rate_limit_state optional)
SELECT key FROM app_settings WHERE key IN ('gps_token', 'gps51_rate_limit_state');
-- Expect gps_token. Cron uses DB config app.settings.supabase_url / supabase_service_role_key.

-- 5. Recent sync activity (last 24h): mix of completed / processing / idle is healthy
SELECT sync_status, COUNT(*) AS cnt
FROM trip_sync_status
GROUP BY sync_status
ORDER BY cnt DESC;
