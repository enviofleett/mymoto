-- PHASE 1: Immediate Storage Relief
-- Delete old API logs (older than 24 hours)
DELETE FROM gps_api_logs WHERE created_at < NOW() - INTERVAL '24 hours';

-- Delete old position history (older than 48 hours)
DELETE FROM position_history WHERE recorded_at < NOW() - INTERVAL '48 hours';

-- Add indexes for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_gps_api_logs_created_at ON gps_api_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_position_history_recorded_at ON position_history(recorded_at);

-- Add index for chat history cleanup
CREATE INDEX IF NOT EXISTS idx_vehicle_chat_history_created_at ON vehicle_chat_history(created_at);