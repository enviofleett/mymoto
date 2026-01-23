-- =============================================================================
-- VERIFY REALTIME FIX FOR VEHICLE LOCATION UPDATES
-- =============================================================================
-- Run this script to verify that the realtime fix has been applied correctly.
--
-- INSTRUCTIONS:
-- 1. Copy this entire script
-- 2. Open Supabase SQL Editor
-- 3. Paste and click "Run"
-- 4. Check that both tests show ✅
--
-- EXPECTED RESULTS:
-- ✅ Realtime Publication: ENABLED
-- ✅ REPLICA IDENTITY: FULL (all columns)
-- =============================================================================

-- Test 1: Check if vehicle_positions is in realtime publication
SELECT
  '1. Realtime Publication' as test_name,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ ENABLED'
    ELSE '❌ NOT ENABLED - Run APPLY_REALTIME_FIX.sql'
  END as status,
  'vehicle_positions should be in supabase_realtime publication' as description
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'vehicle_positions';

-- Test 2: Check REPLICA IDENTITY setting
SELECT
  '2. REPLICA IDENTITY' as test_name,
  CASE c.relreplident
    WHEN 'f' THEN '✅ FULL (all columns)'
    WHEN 'd' THEN '❌ DEFAULT (only primary key) - Run APPLY_REALTIME_FIX.sql'
    WHEN 'n' THEN '❌ NOTHING - Run APPLY_REALTIME_FIX.sql'
    WHEN 'i' THEN '⚠️  INDEX - May work but FULL is recommended'
  END as status,
  'REPLICA IDENTITY should be FULL to send all column data' as description
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'vehicle_positions';

-- Test 3: List all tables in realtime publication (for reference)
SELECT
  '3. All Realtime Tables' as test_name,
  STRING_AGG(tablename, ', ' ORDER BY tablename) as tables,
  'These tables are enabled for realtime' as description
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';

-- Test 4: Check if realtime publication exists
SELECT
  '4. Realtime Publication Exists' as test_name,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ EXISTS'
    ELSE '❌ NOT FOUND - Contact Supabase support'
  END as status,
  'supabase_realtime publication must exist' as description
FROM pg_publication
WHERE pubname = 'supabase_realtime';

-- =============================================================================
-- TROUBLESHOOTING
-- =============================================================================
-- If tests fail:
-- 1. Run APPLY_REALTIME_FIX.sql to apply the fix
-- 2. If still failing, check Supabase dashboard settings
-- 3. Ensure database has realtime enabled in project settings
-- =============================================================================

-- Additional diagnostic: Show current vehicle_positions table structure
SELECT
  '5. Table Info' as test_name,
  'device_id (PK), latitude, longitude, speed, gps_time, etc.' as columns,
  'Verify table exists and has expected columns' as description
WHERE EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'vehicle_positions'
);
