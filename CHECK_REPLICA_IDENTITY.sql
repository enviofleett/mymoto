-- ============================================================================
-- Check REPLICA IDENTITY for vehicle_positions
-- ============================================================================
-- This is the critical setting for realtime to work properly
-- ============================================================================

SELECT 
  'vehicle_positions' as table_name,
  CASE relreplident
    WHEN 'f' THEN '✅ FULL - All columns included in updates (CORRECT)'
    WHEN 'd' THEN '⚠️ DEFAULT - Only primary key columns (may miss data)'
    WHEN 'n' THEN '❌ NOTHING - No data in updates (WILL NOT WORK)'
    WHEN 'i' THEN 'INDEX - Uses index columns'
    ELSE '❓ UNKNOWN'
  END as replica_identity_status,
  relreplident as raw_value
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'vehicle_positions';

-- ============================================================================
-- If status is NOT "✅ FULL", run this:
-- ============================================================================
-- ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;
-- ============================================================================
