-- Verify timezone is set correctly
SHOW timezone;

-- Test timezone conversion
SELECT 
  NOW() as utc_time,
  NOW() AT TIME ZONE 'UTC' as utc_explicit,
  NOW() AT TIME ZONE 'Africa/Lagos' as lagos_time,
  CURRENT_TIMESTAMP as current_timestamp;

-- Check if invalid timestamps are gone
SELECT 
  COUNT(*) as invalid_future_count
FROM position_history 
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '7 days';

SELECT 
  COUNT(*) as invalid_future_count
FROM vehicle_positions 
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND cached_at >= NOW() - INTERVAL '7 days';
