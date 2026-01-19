-- Check if data exists in tables (expanded time windows)
-- Use this to verify if tables have any data at all

-- ============================================================================
-- 1. Check ACC state history - Last 7 days (broader check)
-- ============================================================================
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT device_id) as unique_devices,
  MIN(begin_time) as earliest_record,
  MAX(begin_time) as latest_record
FROM acc_state_history
WHERE begin_time >= NOW() - INTERVAL '7 days';

-- ============================================================================
-- 2. Check position_history - Last 7 days
-- ============================================================================
SELECT 
  COUNT(*) as total_positions,
  COUNT(ignition_confidence) as with_confidence,
  MIN(gps_time) as earliest_record,
  MAX(gps_time) as latest_record
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '7 days';

-- ============================================================================
-- 3. Check vehicle_positions - Current state
-- ============================================================================
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(ignition_confidence) as with_confidence,
  MIN(gps_time) as earliest_position,
  MAX(gps_time) as latest_position
FROM vehicle_positions;

-- ============================================================================
-- 4. Check if ANY data exists (using pg_stat_user_tables - FASTEST)
-- ============================================================================
-- This uses PostgreSQL statistics, no table scan needed
SELECT 
  schemaname,
  relname as tablename,
  n_live_tup as estimated_rows,
  last_vacuum,
  last_analyze
FROM pg_stat_user_tables
WHERE relname IN ('position_history', 'vehicle_positions', 'acc_state_history')
ORDER BY relname;

-- ============================================================================
-- 5. Check oldest/newest records (run separately, one table at a time)
-- ============================================================================
-- Run these ONE AT A TIME to avoid timeout

-- 5a: position_history (uses index, should be fast)
SELECT 
  'position_history' as table_name,
  MIN(gps_time) as earliest,
  MAX(gps_time) as latest
FROM position_history;

-- 5b: vehicle_positions (small table, should be fast)
SELECT 
  'vehicle_positions' as table_name,
  MIN(gps_time) as earliest,
  MAX(gps_time) as latest
FROM vehicle_positions;

-- 5c: acc_state_history (run separately)
SELECT 
  'acc_state_history' as table_name,
  MIN(begin_time) as earliest,
  MAX(begin_time) as latest
FROM acc_state_history;
