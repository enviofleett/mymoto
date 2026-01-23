-- ============================================================================
-- Verification Script: Realtime Location Updates Fix
-- ============================================================================
-- Run this in Supabase Dashboard → SQL Editor to verify the fix is applied
-- ============================================================================

-- Check 1: Verify vehicle_positions is in the realtime publication
SELECT 
  tablename,
  pubname,
  CASE 
    WHEN tablename = 'vehicle_positions' THEN '✅ FOUND'
    ELSE '❌ NOT FOUND'
  END as status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'vehicle_positions';

-- Expected Result: 1 row with status = '✅ FOUND'

-- ============================================================================

-- Check 2: Verify REPLICA IDENTITY is FULL
SELECT 
  schemaname,
  tablename,
  CASE relreplident
    WHEN 'f' THEN 'FULL ✅'
    WHEN 'd' THEN 'DEFAULT (OK if has PK)'
    WHEN 'n' THEN 'NOTHING ❌'
    WHEN 'i' THEN 'INDEX'
    ELSE 'UNKNOWN'
  END as replica_identity,
  relreplident
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
WHERE tablename = 'vehicle_positions'
  AND schemaname = 'public';

-- Expected Result: replica_identity = 'FULL ✅' or 'DEFAULT (OK if has PK)'

-- ============================================================================

-- Check 3: Verify table has primary key (required for realtime)
SELECT 
  tablename,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conrelid = c.oid 
      AND contype = 'p'
    ) THEN '✅ Has Primary Key'
    ELSE '❌ No Primary Key'
  END as has_primary_key
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
WHERE tablename = 'vehicle_positions'
  AND schemaname = 'public';

-- Expected Result: has_primary_key = '✅ Has Primary Key'

-- ============================================================================

-- Check 4: Summary - All checks in one query
SELECT 
  'vehicle_positions' as table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'vehicle_positions'
    ) THEN '✅ In Realtime Publication'
    ELSE '❌ NOT in Realtime Publication'
  END as publication_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint 
      JOIN pg_class c ON c.oid = conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      AND c.relname = 'vehicle_positions'
      AND contype = 'p'
    ) THEN '✅ Has Primary Key'
    ELSE '❌ No Primary Key'
  END as primary_key_status,
  CASE 
    WHEN (
      SELECT relreplident::text
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      AND c.relname = 'vehicle_positions'
    ) = 'f' THEN '✅ FULL'
    WHEN (
      SELECT relreplident::text
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      AND c.relname = 'vehicle_positions'
    ) = 'd' THEN '⚠️ DEFAULT (OK if has PK)'
    ELSE '❌ NOT FULL'
  END as replica_identity_status;

-- Expected Result: All three statuses should be ✅

-- ============================================================================
-- If any check fails, run APPLY_REALTIME_FIX.sql
-- ============================================================================
