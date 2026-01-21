-- Final Verification: Timezone Setup Complete
-- ============================================

-- 1. Verify timezone is set
SHOW timezone;
-- Expected: Africa/Lagos

-- 2. Test timezone conversion
SELECT 
  NOW() as current_time,
  NOW() AT TIME ZONE 'UTC' as utc_time,
  NOW() AT TIME ZONE 'Africa/Lagos' as lagos_time,
  EXTRACT(TIMEZONE_HOUR FROM NOW() AT TIME ZONE 'Africa/Lagos') as lagos_offset_hours;

-- 3. Confirm no invalid timestamps (should return false/0)
SELECT EXISTS(
  SELECT 1 FROM position_history 
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND recorded_at >= NOW() - INTERVAL '24 hours'
  LIMIT 1
) as has_invalid_position_history;

SELECT EXISTS(
  SELECT 1 FROM vehicle_positions 
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND cached_at >= NOW() - INTERVAL '24 hours'
  LIMIT 1
) as has_invalid_vehicle_positions;
