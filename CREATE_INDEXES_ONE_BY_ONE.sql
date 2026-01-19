-- Create Performance Indexes One at a Time
-- Run each CREATE INDEX statement separately to avoid timeouts
-- Wait for each to complete before running the next

-- ============================================================================
-- STEP 1: position_history indexes (run these one at a time)
-- ============================================================================

-- Index 1: Primary time-based index (most important)
CREATE INDEX IF NOT EXISTS idx_position_history_gps_time 
ON position_history(gps_time DESC);

-- Index 2: Device + time composite (run after Index 1 completes)
CREATE INDEX IF NOT EXISTS idx_position_history_device_gps_time 
ON position_history(device_id, gps_time DESC);

-- Index 3: Confidence partial index (run after Index 2 completes)
CREATE INDEX IF NOT EXISTS idx_position_history_ignition_confidence 
ON position_history(ignition_confidence) 
WHERE ignition_confidence IS NOT NULL;

-- Index 4: Detection method composite (run after Index 3 completes)
CREATE INDEX IF NOT EXISTS idx_position_history_detection_method 
ON position_history(device_id, ignition_detection_method, gps_time DESC)
WHERE ignition_detection_method IS NOT NULL;

-- ============================================================================
-- STEP 2: vehicle_positions indexes (run these one at a time)
-- ============================================================================

-- Index 5: Primary time-based index
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_gps_time 
ON vehicle_positions(gps_time DESC);

-- Index 6: Cache time index (run after Index 5 completes)
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_cached_at 
ON vehicle_positions(cached_at DESC);

-- Index 7: Device + time composite (run after Index 6 completes)
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_device_gps_time 
ON vehicle_positions(device_id, gps_time DESC);

-- Index 8: Confidence partial index (run after Index 7 completes)
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_ignition_confidence 
ON vehicle_positions(ignition_confidence) 
WHERE ignition_confidence IS NOT NULL;

-- ============================================================================
-- STEP 3: acc_state_history indexes (run these one at a time)
-- ============================================================================

-- Index 9: Time-based index
CREATE INDEX IF NOT EXISTS idx_acc_state_history_begin_time 
ON acc_state_history(begin_time DESC);

-- Index 10: Device + time composite (run after Index 9 completes)
CREATE INDEX IF NOT EXISTS idx_acc_state_history_device_begin_time 
ON acc_state_history(device_id, begin_time DESC);

-- ============================================================================
-- VERIFICATION: Check which indexes exist (run after all indexes are created)
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('position_history', 'vehicle_positions', 'acc_state_history')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
