-- INSTANT Status Check (No Timeout Guaranteed)
-- Uses PostgreSQL statistics - no table scans
-- Run this first to get quick overview

-- ============================================================================
-- Quick Status - Uses pg_stat_user_tables (instant, no scan)
-- ============================================================================
SELECT 
  relname as tablename,
  n_live_tup as estimated_rows,
  n_dead_tup as dead_rows,
  last_vacuum,
  last_analyze,
  CASE 
    WHEN last_analyze IS NULL THEN 'Never analyzed'
    WHEN last_analyze < NOW() - INTERVAL '7 days' THEN 'Stale stats'
    ELSE 'Recent stats'
  END as stats_status
FROM pg_stat_user_tables
WHERE relname IN ('position_history', 'vehicle_positions', 'acc_state_history', 'vehicles')
ORDER BY n_live_tup DESC NULLS LAST;

-- ============================================================================
-- Check if indexes are being used (shows index usage stats)
-- ============================================================================
SELECT 
  schemaname,
  relname as tablename,
  indexrelname as indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE relname IN ('position_history', 'vehicle_positions', 'acc_state_history')
  AND indexrelname LIKE 'idx_%'
ORDER BY idx_scan DESC
LIMIT 20;
