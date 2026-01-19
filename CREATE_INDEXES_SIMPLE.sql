-- Create Performance Indexes - Copy and Run ONE at a Time
-- Copy each statement below and run it separately in Supabase SQL Editor
-- Wait for each to complete (may take 1-5 minutes) before running the next

-- ============================================================================
-- INDEX 1: position_history - gps_time (MOST IMPORTANT - Run this first!)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_position_history_gps_time ON position_history(gps_time DESC);

-- ============================================================================
-- INDEX 2: position_history - device_id + gps_time (Run after Index 1)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_position_history_device_gps_time ON position_history(device_id, gps_time DESC);

-- ============================================================================
-- INDEX 3: position_history - ignition_confidence (Run after Index 2)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_position_history_ignition_confidence ON position_history(ignition_confidence) WHERE ignition_confidence IS NOT NULL;

-- ============================================================================
-- INDEX 4: position_history - detection method (Run after Index 3)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_position_history_detection_method ON position_history(device_id, ignition_detection_method, gps_time DESC) WHERE ignition_detection_method IS NOT NULL;

-- ============================================================================
-- INDEX 5: vehicle_positions - gps_time (Run after Index 4)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_gps_time ON vehicle_positions(gps_time DESC);

-- ============================================================================
-- INDEX 6: vehicle_positions - cached_at (Run after Index 5)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_cached_at ON vehicle_positions(cached_at DESC);

-- ============================================================================
-- INDEX 7: vehicle_positions - device_id + gps_time (Run after Index 6)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_device_gps_time ON vehicle_positions(device_id, gps_time DESC);

-- ============================================================================
-- INDEX 8: vehicle_positions - ignition_confidence (Run after Index 7)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_ignition_confidence ON vehicle_positions(ignition_confidence) WHERE ignition_confidence IS NOT NULL;

-- ============================================================================
-- INDEX 9: acc_state_history - begin_time (Run after Index 8)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_acc_state_history_begin_time ON acc_state_history(begin_time DESC);

-- ============================================================================
-- INDEX 10: acc_state_history - device_id + begin_time (Run after Index 9)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_acc_state_history_device_begin_time ON acc_state_history(device_id, begin_time DESC);

-- ============================================================================
-- VERIFICATION: Run this AFTER all indexes are created
-- ============================================================================
SELECT schemaname, tablename, indexname FROM pg_indexes WHERE tablename IN ('position_history', 'vehicle_positions', 'acc_state_history') AND indexname LIKE 'idx_%' ORDER BY tablename, indexname;
