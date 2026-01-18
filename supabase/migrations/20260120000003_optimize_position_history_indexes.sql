-- Optimize position_history indexes for RecentActivityFeed queries
-- The query filters by gps_time, latitude, longitude, and orders by gps_time DESC

-- Add index for time-based queries (used by RecentActivityFeed)
-- This index supports queries filtering by gps_time with null checks
CREATE INDEX IF NOT EXISTS idx_position_history_gps_time_desc 
ON position_history(gps_time DESC)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add composite index for device + time queries (if deviceId filter is used)
CREATE INDEX IF NOT EXISTS idx_position_history_device_gps_time_valid_coords
ON position_history(device_id, gps_time DESC)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add index on recorded_at for cleanup queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_position_history_recorded_at 
ON position_history(recorded_at DESC);

-- Analyze the table to update statistics
ANALYZE position_history;
