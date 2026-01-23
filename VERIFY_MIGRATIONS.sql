-- ============================================================================
-- VERIFICATION QUERIES FOR NOTIFICATION SYSTEM MIGRATIONS
-- ============================================================================
-- Run these queries in Supabase SQL Editor (NOT in terminal)
-- After deploying DEPLOY_NOTIFICATIONS_COMBINED.sql
-- ============================================================================

-- 1. Check if vehicle_moving exists in event_type enum
SELECT unnest(enum_range(NULL::event_type)) AS event_type
ORDER BY event_type;

-- Expected: Should include 'vehicle_moving' in the list

-- ============================================================================

-- 2. Check if detect_overspeeding_unified function exists
SELECT 
  proname AS function_name,
  pg_get_functiondef(oid) AS function_definition
FROM pg_proc 
WHERE proname = 'detect_overspeeding_unified';

-- Expected: Should return 1 row with the function definition

-- ============================================================================

-- 3. Check if detect_vehicle_events function was updated
SELECT 
  proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%vehicle_moving%' THEN '✅ Updated with vehicle_moving'
    ELSE '❌ Not updated'
  END AS status
FROM pg_proc 
WHERE proname = 'detect_vehicle_events';

-- Expected: Should show "✅ Updated with vehicle_moving"

-- ============================================================================

-- 4. Check if triggers are created
SELECT 
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  tgenabled AS enabled
FROM pg_trigger 
WHERE tgname IN (
  'trigger_detect_overspeeding_unified',
  'trigger_detect_critical_events_battery',
  'trigger_detect_critical_events_insert'
)
ORDER BY tgname;

-- Expected: Should return 3 rows (all triggers exist)

-- ============================================================================

-- 5. Check if event_severity enum exists
SELECT 
  t.typname AS enum_name,
  n.nspname AS schema_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'event_severity'
  AND n.nspname = 'public'
GROUP BY t.typname, n.nspname;

-- Expected: Should return enum with values: info, warning, error, critical

-- ============================================================================

-- 6. Quick test: Check recent proactive events (if any exist)
SELECT 
  event_type,
  severity,
  title,
  created_at
FROM proactive_vehicle_events
ORDER BY created_at DESC
LIMIT 10;

-- Expected: Should show recent events (if any vehicles have triggered events)

-- ============================================================================
-- SUMMARY CHECK
-- ============================================================================

-- Run this to get a summary of all checks
SELECT 
  'event_type enum' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'event_type' AND n.nspname = 'public'
      AND e.enumlabel = 'vehicle_moving'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS status

UNION ALL

SELECT 
  'detect_overspeeding_unified function' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'detect_overspeeding_unified'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS status

UNION ALL

SELECT 
  'detect_vehicle_events updated' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'detect_vehicle_events'
      AND pg_get_functiondef(oid) LIKE '%vehicle_moving%'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS status

UNION ALL

SELECT 
  'overspeeding trigger' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'trigger_detect_overspeeding_unified'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS status

UNION ALL

SELECT 
  'battery triggers' AS check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname IN (
        'trigger_detect_critical_events_battery',
        'trigger_detect_critical_events_insert'
      )
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS status;

-- Expected: All checks should show ✅ PASS
