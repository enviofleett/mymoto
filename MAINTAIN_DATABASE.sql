-- Database Maintenance Script
-- Run these to improve query performance on large tables

-- ============================================================================
-- STEP 1: ANALYZE position_history (Updates statistics for query planner)
-- ============================================================================
-- This is CRITICAL - Without this, PostgreSQL can't plan queries efficiently
-- Estimated time: 2-5 minutes for 32M rows
ANALYZE position_history;

-- ============================================================================
-- STEP 2: ANALYZE other tables (Quick, should be fast)
-- ============================================================================
ANALYZE vehicles;
ANALYZE vehicle_positions;
ANALYZE acc_state_history;

-- ============================================================================
-- STEP 3: VACUUM position_history (Cleans up dead rows - OPTIONAL)
-- ============================================================================
-- This removes 1.3M dead rows and reclaims space
-- Estimated time: 5-15 minutes for 32M rows
-- Can run during off-peak hours if needed
-- VACUUM ANALYZE position_history;  -- Uncomment to run

-- ============================================================================
-- VERIFICATION: Check if analyze worked
-- ============================================================================
SELECT 
  relname as tablename,
  n_live_tup as estimated_rows,
  last_analyze,
  CASE 
    WHEN last_analyze IS NULL THEN '❌ Not analyzed'
    WHEN last_analyze < NOW() - INTERVAL '1 hour' THEN '⚠️ Stale'
    ELSE '✅ Recent'
  END as status
FROM pg_stat_user_tables
WHERE relname IN ('position_history', 'vehicle_positions', 'acc_state_history', 'vehicles')
ORDER BY relname;
