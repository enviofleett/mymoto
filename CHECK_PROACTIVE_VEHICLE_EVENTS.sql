-- ============================================================================
-- CHECK IF proactive_vehicle_events TABLE EXISTS
-- ============================================================================
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Check if table exists
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'proactive_vehicle_events';

-- Expected: Should return 1 row if table exists

-- ============================================================================

-- 2. Check table structure (columns)
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'proactive_vehicle_events'
ORDER BY ordinal_position;

-- Expected: Should show all columns (id, device_id, event_type, severity, etc.)

-- ============================================================================

-- 3. Check if table has any data
SELECT 
  COUNT(*) AS total_events,
  COUNT(DISTINCT device_id) AS unique_vehicles,
  COUNT(DISTINCT event_type) AS unique_event_types,
  MIN(created_at) AS oldest_event,
  MAX(created_at) AS newest_event
FROM proactive_vehicle_events;

-- Expected: Should return counts (may be 0 if no events yet)

-- ============================================================================

-- 4. Check recent events (last 10)
SELECT 
  id,
  device_id,
  event_type,
  severity,
  title,
  message,
  created_at,
  acknowledged
FROM proactive_vehicle_events
ORDER BY created_at DESC
LIMIT 10;

-- Expected: Should show recent events (if any exist)

-- ============================================================================

-- 5. Check indexes on the table
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'proactive_vehicle_events';

-- Expected: Should show indexes for performance

-- ============================================================================

-- 6. Check RLS (Row Level Security) status
SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'proactive_vehicle_events';

-- Expected: Should show if RLS is enabled

-- ============================================================================

-- 7. Check RLS policies
SELECT 
  policyname,
  permissive,
  roles,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'proactive_vehicle_events';

-- Expected: Should show RLS policies (if RLS is enabled)

-- ============================================================================
-- SUMMARY CHECK
-- ============================================================================

SELECT 
  'Table exists' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'proactive_vehicle_events'
    ) THEN '✅ PASS - Table exists'
    ELSE '❌ FAIL - Table does not exist'
  END AS status

UNION ALL

SELECT 
  'Has columns' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'proactive_vehicle_events'
    ) THEN '✅ PASS - Has columns'
    ELSE '❌ FAIL - No columns found'
  END AS status

UNION ALL

SELECT 
  'Has indexes' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'proactive_vehicle_events'
    ) THEN '✅ PASS - Has indexes'
    ELSE '⚠️ WARNING - No indexes (may affect performance)'
  END AS status

UNION ALL

SELECT 
  'RLS enabled' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' 
        AND tablename = 'proactive_vehicle_events'
        AND rowsecurity = true
    ) THEN '✅ PASS - RLS enabled'
    ELSE '⚠️ WARNING - RLS not enabled'
  END AS status;

-- Expected: All checks should show ✅ PASS
