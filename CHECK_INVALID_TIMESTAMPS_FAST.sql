-- Fast check: Only check recent records (last 24 hours)
-- This avoids scanning entire tables

-- Check position_history (recent records only)
SELECT 
  'position_history_future' as check_type,
  COUNT(*) FILTER (WHERE gps_time > NOW() + INTERVAL '1 day') as invalid_count
FROM position_history
WHERE recorded_at >= NOW() - INTERVAL '24 hours'
LIMIT 1;

-- Check vehicle_positions (recent records only)
SELECT 
  'vehicle_positions_future' as check_type,
  COUNT(*) FILTER (WHERE gps_time > NOW() + INTERVAL '1 day') as invalid_count
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '24 hours'
LIMIT 1;
