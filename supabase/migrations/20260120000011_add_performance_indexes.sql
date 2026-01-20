-- Performance Indexes Migration
-- Creates indexes to improve query performance for common access patterns

-- 1. Chat history lookups: (device_id, user_id, created_at DESC)
-- Partial index for last 30 days to reduce index size
CREATE INDEX IF NOT EXISTS idx_vehicle_chat_history_device_user_created
ON vehicle_chat_history(device_id, user_id, created_at DESC)
WHERE created_at >= NOW() - INTERVAL '30 days';

-- 2. Proactive events deduplication: (notified, device_id, created_at DESC)
-- Partial index where notified = false for faster unprocessed event queries
CREATE INDEX IF NOT EXISTS idx_proactive_vehicle_events_notified_device_created
ON proactive_vehicle_events(notified, device_id, created_at DESC)
WHERE notified = false;

-- 3. Position history: (device_id, recorded_at DESC)
-- Partial index for last 90 days to reduce index size
CREATE INDEX IF NOT EXISTS idx_position_history_device_recorded
ON position_history(device_id, recorded_at DESC)
WHERE recorded_at >= NOW() - INTERVAL '90 days';

-- 4. Trip lookups: (device_id, start_time DESC)
-- Partial index for last 90 days to reduce index size
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_start_time
ON vehicle_trips(device_id, start_time DESC)
WHERE start_time >= NOW() - INTERVAL '90 days';

-- Add comments for documentation
COMMENT ON INDEX idx_vehicle_chat_history_device_user_created IS 'Optimizes chat history queries by device and user, partial index for last 30 days';
COMMENT ON INDEX idx_proactive_vehicle_events_notified_device_created IS 'Optimizes unprocessed proactive event queries';
COMMENT ON INDEX idx_position_history_device_recorded IS 'Optimizes position history queries by device, partial index for last 90 days';
COMMENT ON INDEX idx_vehicle_trips_device_start_time IS 'Optimizes trip queries by device, partial index for last 90 days';
