-- Fast Timezone Setup - Run Step by Step
-- ============================================

-- STEP 1: Set timezone (fast)
SET timezone = 'Africa/Lagos';
SHOW timezone;

-- STEP 2: Quick check for invalid timestamps (run separately if timeout)
-- Check position_history
SELECT EXISTS(
  SELECT 1 FROM position_history 
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND recorded_at >= NOW() - INTERVAL '24 hours'
  LIMIT 1
) as has_invalid_in_position_history;

-- Check vehicle_positions  
SELECT EXISTS(
  SELECT 1 FROM vehicle_positions 
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND cached_at >= NOW() - INTERVAL '24 hours'
  LIMIT 1
) as has_invalid_in_vehicle_positions;

-- STEP 3: If invalid found, show samples (run separately)
-- SELECT device_id, gps_time, recorded_at
-- FROM position_history
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND recorded_at >= NOW() - INTERVAL '24 hours'
-- LIMIT 5;

-- STEP 4: Clean if needed (run separately)
-- UPDATE position_history SET gps_time = NULL
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND recorded_at >= NOW() - INTERVAL '24 hours';
--
-- UPDATE vehicle_positions SET gps_time = NULL
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND cached_at >= NOW() - INTERVAL '24 hours';
