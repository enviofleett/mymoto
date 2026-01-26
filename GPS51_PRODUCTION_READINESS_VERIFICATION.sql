-- ============================================================================
-- GPS51 Direct Data Sync - Production Readiness Verification
-- Run in Supabase SQL Editor. Document results for each section.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PHASE 1.1: GPS51 Sync Tables (PROMPT EXPECTS: gps51_trips, gps51_alarms, gps51_sync_status)
-- ----------------------------------------------------------------------------
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('gps51_trips', 'gps51_alarms', 'gps51_sync_status')
ORDER BY table_name, ordinal_position;
-- Expected if spec implemented: Rows for all 3 tables. Actual: 0 rows (tables do not exist).

-- Check GENERATED column on gps51_trips
SELECT column_name, column_default, is_generated
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'gps51_trips' AND column_name = 'distance_km';
-- Expected: is_generated = 'ALWAYS'. Actual: 0 rows.

-- ----------------------------------------------------------------------------
-- PHASE 1.1 ALTERNATE: Current schema (vehicle_trips, trip_sync_status)
-- ----------------------------------------------------------------------------
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('vehicle_trips', 'trip_sync_status')
ORDER BY table_name, ordinal_position;

-- ----------------------------------------------------------------------------
-- PHASE 1.2: Cron jobs (PROMPT EXPECTS: sync-gps51-trips, sync-gps51-alarms)
-- ----------------------------------------------------------------------------
SELECT jobid, jobname, schedule, active,
  CASE WHEN command LIKE '%sync-gps51-trips%' THEN 'trips-ok'
       WHEN command LIKE '%sync-gps51-alarms%' THEN 'alarms-ok'
       WHEN command LIKE '%sync-trips-incremental%' THEN 'current-trips'
       ELSE 'other' END AS url_check
FROM cron.job
WHERE jobname LIKE 'sync-gps51%' OR command LIKE '%sync-gps51%' OR command LIKE '%sync-trips-incremental%';

-- Manual trigger functions (PROMPT: trigger_gps51_trips_sync, trigger_gps51_alarms_sync)
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (routine_name LIKE 'trigger_gps51%' OR routine_name = 'trigger_trip_sync')
ORDER BY routine_name;

-- ----------------------------------------------------------------------------
-- PHASE 2: Timezone (session check)
-- ----------------------------------------------------------------------------
SHOW timezone;
-- Expected: Africa/Lagos or similar. Document actual.

-- ----------------------------------------------------------------------------
-- PHASE 4: RLS on GPS51 tables (if they existed)
-- ----------------------------------------------------------------------------
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('gps51_trips', 'gps51_alarms', 'gps51_sync_status');
-- 0 rows if tables missing.

-- RLS on current tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('vehicle_trips', 'trip_sync_status');

-- Policies on vehicle_trips
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'vehicle_trips'
ORDER BY policyname;

-- ----------------------------------------------------------------------------
-- PHASE 5: Indexes (PROMPT: gps51_* indexes)
-- ----------------------------------------------------------------------------
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('gps51_trips', 'gps51_alarms', 'gps51_sync_status')
ORDER BY tablename, indexname;
-- 0 rows if tables missing.

-- Current indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE tablename IN ('vehicle_trips', 'trip_sync_status')
ORDER BY tablename, indexname;

-- ----------------------------------------------------------------------------
-- PHASE 9: Sync status / errors (PROMPT: gps51_sync_status)
-- ----------------------------------------------------------------------------
-- Use trip_sync_status as stand-in
SELECT device_id, sync_status, error_message, last_sync_at, updated_at
FROM trip_sync_status
WHERE sync_status = 'error' OR error_message IS NOT NULL
LIMIT 20;
-- Expected: 0 rows for "no errors".
