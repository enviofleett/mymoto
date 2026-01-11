-- Add fleet-scale optimization columns to vehicle_positions
ALTER TABLE vehicle_positions 
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE vehicle_positions 
ADD COLUMN IF NOT EXISTS sync_priority TEXT DEFAULT 'normal' 
CHECK (sync_priority IN ('high', 'normal', 'low'));

-- Create index for efficient frontend queries
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_device_online 
ON vehicle_positions(device_id, is_online);

-- Create index for sync priority optimization
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_sync_priority 
ON vehicle_positions(sync_priority, cached_at);

-- Create GPS sync health monitoring view
CREATE OR REPLACE VIEW v_gps_sync_health AS
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(*) FILTER (WHERE is_online = true) as online_count,
  COUNT(*) FILTER (WHERE sync_priority = 'high') as moving_count,
  COUNT(*) FILTER (WHERE cached_at < now() - interval '5 minutes') as stale_count,
  MIN(cached_at) as oldest_sync,
  MAX(cached_at) as newest_sync,
  ROUND(AVG(EXTRACT(EPOCH FROM (now() - cached_at)))::numeric, 1) as avg_age_seconds
FROM vehicle_positions;