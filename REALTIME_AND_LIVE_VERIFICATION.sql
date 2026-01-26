-- Realtime & LIVE data verification
-- Run in Supabase SQL Editor to confirm vehicle_positions Realtime + gps-data updates.

-- 1. vehicle_positions must be in supabase_realtime for Realtime updates
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('vehicle_positions', 'proactive_vehicle_events', 'vehicle_trips', 'trip_sync_status')
ORDER BY tablename;

-- 2. Recent vehicle_positions updates (gps-data cron :00, :15, :30, :45)
SELECT device_id,
       gps_time AS last_update,
       gps_fix_time AS last_gps_fix,
       last_synced_at,
       cached_at,
       round(EXTRACT(EPOCH FROM (now() - gps_time)) / 60) AS minutes_since_update
FROM vehicle_positions
WHERE gps_time IS NOT NULL
ORDER BY gps_time DESC
LIMIT 10;

-- 3. Cron jobs (gps-data, sync-trips)
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('sync-gps-data', 'auto-sync-trips-staggered')
ORDER BY jobname;

-- 4. RLS on vehicle_positions (must allow SELECT for authenticated/anon)
SELECT polname, polcmd, polroles::regrole[]
FROM pg_policy
WHERE polrelid = 'public.vehicle_positions'::regclass;
