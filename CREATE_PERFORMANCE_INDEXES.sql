-- Performance Indexes for Query Optimization
-- Run this script to create indexes that will speed up queries and prevent timeouts
-- 
-- Note: Index creation may take a few minutes on large tables
-- You can run these individually if needed

-- ============================================================================
-- Indexes for position_history table
-- ============================================================================

-- Primary time-based index (most queries filter by gps_time)
CREATE INDEX IF NOT EXISTS idx_position_history_gps_time 
ON position_history(gps_time DESC);

-- Composite index for device + time queries
CREATE INDEX IF NOT EXISTS idx_position_history_device_gps_time 
ON position_history(device_id, gps_time DESC);

-- Partial index for confidence queries (only indexes rows with confidence data)
CREATE INDEX IF NOT EXISTS idx_position_history_ignition_confidence 
ON position_history(ignition_confidence) 
WHERE ignition_confidence IS NOT NULL;

-- Composite index for detection method analysis
CREATE INDEX IF NOT EXISTS idx_position_history_detection_method 
ON position_history(device_id, ignition_detection_method, gps_time DESC)
WHERE ignition_detection_method IS NOT NULL;

-- ============================================================================
-- Indexes for vehicle_positions table
-- ============================================================================

-- Primary time-based index
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_gps_time 
ON vehicle_positions(gps_time DESC);

-- Cache time index (for queries filtering by cached_at)
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_cached_at 
ON vehicle_positions(cached_at DESC);

-- Composite index for device + time queries
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_device_gps_time 
ON vehicle_positions(device_id, gps_time DESC);

-- Partial index for confidence queries
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_ignition_confidence 
ON vehicle_positions(ignition_confidence) 
WHERE ignition_confidence IS NOT NULL;

-- ============================================================================
-- Indexes for acc_state_history table
-- ============================================================================

-- Time-based index for ACC state queries
CREATE INDEX IF NOT EXISTS idx_acc_state_history_begin_time 
ON acc_state_history(begin_time DESC);

-- Device + time composite index
CREATE INDEX IF NOT EXISTS idx_acc_state_history_device_begin_time 
ON acc_state_history(device_id, begin_time DESC);

-- ============================================================================
-- Verify Index Creation
-- ============================================================================
-- Run this query to verify indexes were created:
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('position_history', 'vehicle_positions', 'acc_state_history')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
