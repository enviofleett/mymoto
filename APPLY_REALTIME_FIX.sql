-- ============================================================================
-- Enable Realtime for vehicle_positions table
-- ============================================================================
-- This script enables Supabase Realtime for the vehicle_positions table,
-- allowing instant location updates without polling.
--
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- Step 1: Add vehicle_positions to the realtime publication (if not already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'vehicle_positions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;
    RAISE NOTICE '✅ Added vehicle_positions to realtime publication';
  ELSE
    RAISE NOTICE 'ℹ️ vehicle_positions is already in realtime publication';
  END IF;
END $$;

-- Step 2: Set REPLICA IDENTITY to FULL (required for UPDATE/DELETE events)
-- This ensures all column changes are captured in the realtime stream
ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;

-- ============================================================================
-- Verification Query (run separately to confirm):
-- ============================================================================
-- SELECT 
--   tablename,
--   pubname
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime' 
--   AND tablename = 'vehicle_positions';
--
-- Expected: Returns 1 row
-- ============================================================================
