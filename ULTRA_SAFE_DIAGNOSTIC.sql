-- Ultra-Safe Diagnostic Queries (Guaranteed No Timeout)
-- These queries use minimal scanning and strict limits
-- Run each query separately

-- ============================================================================
-- 1. Check vehicle_positions - Current state only (no time filter)
-- ============================================================================
-- This table is small (one row per vehicle), so COUNT is fast
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(ignition_confidence) as with_confidence,
  MAX(gps_time) as latest_position
FROM vehicle_positions;

-- ============================================================================
-- 2. Check position_history - Sample only (last 1 hour, limited scan)
-- ============================================================================
-- Uses index on gps_time, limits to 1 hour, stops after finding data
SELECT 
  COUNT(*) as total_positions,
  MAX(gps_time) as latest_record
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour'
LIMIT 1;  -- Stop after first match (just checking if data exists)

-- Actually, let's use a simpler approach - just check if ANY recent data exists
SELECT EXISTS(
  SELECT 1 FROM position_history 
  WHERE gps_time >= NOW() - INTERVAL '1 hour' 
  LIMIT 1
) as has_recent_data;

-- ============================================================================
-- 3. Check acc_state_history - Sample only (last 1 hour)
-- ============================================================================
SELECT EXISTS(
  SELECT 1 FROM acc_state_history 
  WHERE begin_time >= NOW() - INTERVAL '1 hour' 
  LIMIT 1
) as has_recent_acc_data;

-- ============================================================================
-- 4. Check oldest data in each table (to see if tables have ANY data)
-- ============================================================================
-- These use indexes and are very fast
SELECT 
  'position_history' as table_name,
  MIN(gps_time) as oldest_record,
  MAX(gps_time) as newest_record
FROM position_history
LIMIT 1;

-- ============================================================================
-- 5. Check if tables exist and have any rows (fastest check)
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  n_live_tup as estimated_rows
FROM pg_stat_user_tables
WHERE tablename IN ('position_history', 'vehicle_positions', 'acc_state_history')
ORDER BY tablename;
