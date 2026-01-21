-- Super fast: Just check if ANY invalid timestamps exist (stops at first match)
-- Run these one at a time to avoid timeout

-- Check 1: position_history future dates
SELECT EXISTS(
  SELECT 1 FROM position_history 
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND recorded_at >= NOW() - INTERVAL '24 hours'
  LIMIT 1
) as has_invalid_future_in_position_history;

-- Check 2: vehicle_positions future dates  
SELECT EXISTS(
  SELECT 1 FROM vehicle_positions 
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND cached_at >= NOW() - INTERVAL '24 hours'
  LIMIT 1
) as has_invalid_future_in_vehicle_positions;
