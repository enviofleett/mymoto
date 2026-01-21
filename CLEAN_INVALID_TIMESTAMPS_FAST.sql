-- Clean invalid timestamps (recent records only - safer and faster)
-- Run these separately

-- Clean position_history (recent records only)
UPDATE position_history
SET gps_time = NULL
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '24 hours';

-- Clean vehicle_positions (recent records only)
UPDATE vehicle_positions
SET gps_time = NULL
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND cached_at >= NOW() - INTERVAL '24 hours';
