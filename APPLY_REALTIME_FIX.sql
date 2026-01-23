-- =============================================================================
-- APPLY REALTIME FIX FOR VEHICLE LOCATION UPDATES
-- =============================================================================
-- This SQL script fixes the issue where vehicle location is not updating
-- in realtime on the vehicle profile page.
--
-- INSTRUCTIONS:
-- 1. Copy this entire script
-- 2. Open Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
-- 3. Paste and click "Run"
-- 4. Verify success using VERIFY_REALTIME_FIX.sql
--
-- WHAT THIS DOES:
-- - Adds vehicle_positions table to the realtime publication
-- - Sets REPLICA IDENTITY FULL to send complete row data in updates
--
-- IMPACT: Instant location updates (< 1 second) instead of 15 second polling
-- =============================================================================

BEGIN;

-- Step 1: Add vehicle_positions to realtime publication
-- This enables Supabase Realtime to listen for changes on this table
DO $$
BEGIN
  -- Check if table is already in publication
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'vehicle_positions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;
    RAISE NOTICE 'Added vehicle_positions to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'vehicle_positions is already in supabase_realtime publication';
  END IF;
END $$;

-- Step 2: Set REPLICA IDENTITY FULL
-- This ensures all columns are sent in UPDATE events (not just primary key)
DO $$
BEGIN
  -- Check current REPLICA IDENTITY setting
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'vehicle_positions'
      AND c.relreplident != 'f'  -- 'f' means FULL
  ) THEN
    ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;
    RAISE NOTICE 'Set REPLICA IDENTITY FULL on vehicle_positions';
  ELSE
    RAISE NOTICE 'vehicle_positions already has REPLICA IDENTITY FULL';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION (Optional - run this to verify the fix)
-- =============================================================================

-- Check realtime publication
SELECT
  'Realtime Publication' as check_type,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ ENABLED'
    ELSE '❌ NOT ENABLED'
  END as status,
  COUNT(*) as count
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'vehicle_positions';

-- Check REPLICA IDENTITY
SELECT
  'REPLICA IDENTITY' as check_type,
  CASE c.relreplident
    WHEN 'f' THEN '✅ FULL (all columns)'
    WHEN 'd' THEN '❌ DEFAULT (only primary key)'
    WHEN 'n' THEN '❌ NOTHING'
    WHEN 'i' THEN '⚠️  INDEX'
  END as status,
  c.relreplident as code
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'vehicle_positions';

-- =============================================================================
-- EXPECTED OUTPUT:
-- Both checks should show ✅ (green checkmark) for the fix to work
-- =============================================================================
