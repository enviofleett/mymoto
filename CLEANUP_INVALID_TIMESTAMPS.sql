-- Cleanup Invalid Timestamps
-- WARNING: Review FIND_INVALID_TIMESTAMPS.sql results before running
-- Backup your database before running cleanup queries
-- OPTIMIZED: Added time filters and batch processing to prevent timeouts

-- ============================================================================
-- OPTION 1: Delete invalid future dates (after current date + 1 day) - OPTIMIZED
-- ============================================================================
-- Uncomment to run - REVIEW FIRST!
-- OPTIMIZED: Only processes recent records to avoid timeouts

-- DELETE FROM position_history
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND recorded_at >= NOW() - INTERVAL '30 days';  -- Only recent records

-- DELETE FROM vehicle_positions
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND cached_at >= NOW() - INTERVAL '30 days';  -- Only recent records

-- ============================================================================
-- OPTION 2: Update invalid dates to NULL (safer - preserves records) - OPTIMIZED
-- ============================================================================
-- Uncomment to run - REVIEW FIRST!
-- OPTIMIZED: Only processes recent records to avoid timeouts

-- UPDATE position_history
-- SET gps_time = NULL
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND recorded_at >= NOW() - INTERVAL '30 days';  -- Only recent records

-- UPDATE vehicle_positions
-- SET gps_time = NULL
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND cached_at >= NOW() - INTERVAL '30 days';  -- Only recent records

-- ============================================================================
-- OPTION 3: Update invalid dates to current time (if you want to keep them) - OPTIMIZED
-- ============================================================================
-- Uncomment to run - REVIEW FIRST!
-- OPTIMIZED: Only processes recent records to avoid timeouts

-- UPDATE position_history
-- SET gps_time = NOW()
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND recorded_at >= NOW() - INTERVAL '30 days';  -- Only recent records

-- UPDATE vehicle_positions
-- SET gps_time = NOW()
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND cached_at >= NOW() - INTERVAL '30 days';  -- Only recent records

-- ============================================================================
-- OPTION 4: Delete very old dates (before 2020) - OPTIMIZED
-- ============================================================================
-- Uncomment to run - REVIEW FIRST!
-- OPTIMIZED: Only processes recent records to avoid timeouts

-- DELETE FROM position_history
-- WHERE gps_time < '2020-01-01'::timestamp
--   AND recorded_at >= NOW() - INTERVAL '90 days';  -- Only recent inserts

-- DELETE FROM vehicle_positions
-- WHERE gps_time < '2020-01-01'::timestamp
--   AND cached_at >= NOW() - INTERVAL '30 days';  -- Only recent records

-- ============================================================================
-- VERIFICATION: Check cleanup results
-- ============================================================================
-- Run this after cleanup to verify
SELECT 
  'position_history' as table_name,
  COUNT(*) FILTER (WHERE gps_time > NOW() + INTERVAL '1 day') as remaining_future,
  COUNT(*) FILTER (WHERE gps_time < '2020-01-01'::timestamp) as remaining_past
FROM position_history

UNION ALL

SELECT 
  'vehicle_positions' as table_name,
  COUNT(*) FILTER (WHERE gps_time > NOW() + INTERVAL '1 day') as remaining_future,
  COUNT(*) FILTER (WHERE gps_time < '2020-01-01'::timestamp) as remaining_past
FROM vehicle_positions;
