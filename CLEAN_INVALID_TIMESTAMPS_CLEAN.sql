-- Clean invalid timestamps (sets to NULL - preserves records)
-- Option 1: Set future dates to NULL
UPDATE position_history
SET gps_time = NULL
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '7 days';

UPDATE vehicle_positions
SET gps_time = NULL
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND cached_at >= NOW() - INTERVAL '7 days';

-- Option 2: Set to current time (uncomment if preferred)
-- UPDATE position_history
-- SET gps_time = NOW()
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND recorded_at >= NOW() - INTERVAL '7 days';
--
-- UPDATE vehicle_positions
-- SET gps_time = NOW()
-- WHERE gps_time > NOW() + INTERVAL '1 day'
--   AND cached_at >= NOW() - INTERVAL '7 days';
