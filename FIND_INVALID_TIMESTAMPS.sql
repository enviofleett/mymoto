-- Find Invalid Timestamps in Database
-- Lagos timezone: Africa/Lagos (UTC+1)
-- OPTIMIZED: Added time filters and limits to prevent timeouts

-- ============================================================================
-- 1. Find invalid future dates in position_history (OPTIMIZED)
-- ============================================================================
-- Anything after current date + 1 day is likely invalid
-- OPTIMIZED: Limit to recent records to avoid full table scan
SELECT 
  COUNT(*) as invalid_count,
  MIN(gps_time) as earliest_invalid,
  MAX(gps_time) as latest_invalid
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '30 days'  -- Only check recent records
LIMIT 100000;  -- Safety limit

-- Sample invalid records (OPTIMIZED: Limited to recent records)
SELECT 
  device_id,
  gps_time,
  recorded_at,
  EXTRACT(YEAR FROM gps_time) as year,
  NOW() as current_time,
  gps_time - NOW() as time_difference
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '30 days'  -- Only check recent records
ORDER BY gps_time DESC
LIMIT 20;

-- ============================================================================
-- 2. Find invalid past dates (too old - before 2020) (OPTIMIZED)
-- ============================================================================
-- OPTIMIZED: Use EXISTS for faster check, limit scan range
SELECT 
  COUNT(*) as too_old_count,
  MIN(gps_time) as earliest,
  MAX(gps_time) as latest
FROM position_history
WHERE gps_time < '2020-01-01'::timestamp
  AND recorded_at >= NOW() - INTERVAL '90 days'  -- Only check recent inserts
LIMIT 100000;  -- Safety limit

-- ============================================================================
-- 3. Find invalid dates in vehicle_positions (OPTIMIZED)
-- ============================================================================
-- OPTIMIZED: vehicle_positions is smaller, but still add limits
SELECT 
  COUNT(*) as invalid_count,
  MIN(gps_time) as earliest_invalid,
  MAX(gps_time) as latest_invalid
FROM vehicle_positions
WHERE (gps_time > NOW() + INTERVAL '1 day'
   OR gps_time < '2020-01-01'::timestamp)
  AND cached_at >= NOW() - INTERVAL '30 days'  -- Only check recent records
LIMIT 10000;  -- Safety limit (smaller table)

-- Sample invalid records (with device name from vehicles table) (OPTIMIZED)
SELECT 
  vp.device_id,
  v.device_name,
  vp.gps_time,
  vp.cached_at,
  EXTRACT(YEAR FROM vp.gps_time) as year,
  NOW() as current_time,
  vp.gps_time - NOW() as time_difference
FROM vehicle_positions vp
LEFT JOIN vehicles v ON vp.device_id = v.device_id
WHERE (vp.gps_time > NOW() + INTERVAL '1 day'
   OR vp.gps_time < '2020-01-01'::timestamp)
  AND vp.cached_at >= NOW() - INTERVAL '30 days'  -- Only check recent records
ORDER BY vp.gps_time DESC
LIMIT 20;

-- ============================================================================
-- 4. Check timezone settings in database
-- ============================================================================
SHOW timezone;

-- Check current time in different zones
SELECT 
  NOW() as utc_time,
  NOW() AT TIME ZONE 'UTC' as utc_explicit,
  NOW() AT TIME ZONE 'Africa/Lagos' as lagos_time,
  CURRENT_TIMESTAMP as current_timestamp;

-- ============================================================================
-- 5. Summary of timestamp issues (OPTIMIZED: Use sampling)
-- ============================================================================
-- OPTIMIZED: Check only recent records and use sampling for large tables
SELECT 
  'position_history' as table_name,
  COUNT(*) FILTER (WHERE gps_time > NOW() + INTERVAL '1 day') as future_dates,
  COUNT(*) FILTER (WHERE gps_time < '2020-01-01'::timestamp) as past_dates,
  COUNT(*) FILTER (WHERE gps_time IS NULL) as null_dates,
  COUNT(*) as sampled_rows
FROM (
  SELECT gps_time 
  FROM position_history
  WHERE recorded_at >= NOW() - INTERVAL '7 days'  -- Only sample recent week
  LIMIT 50000  -- Sample size
) recent_sample

UNION ALL

SELECT 
  'vehicle_positions' as table_name,
  COUNT(*) FILTER (WHERE gps_time > NOW() + INTERVAL '1 day') as future_dates,
  COUNT(*) FILTER (WHERE gps_time < '2020-01-01'::timestamp) as past_dates,
  COUNT(*) FILTER (WHERE gps_time IS NULL) as null_dates,
  COUNT(*) as sampled_rows
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '7 days'  -- Only check recent week
LIMIT 10000;  -- Safety limit
