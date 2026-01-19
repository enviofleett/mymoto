-- Find Invalid Timestamps - FAST VERSION
-- Lagos timezone: Africa/Lagos (UTC+1)
-- Optimized for speed: Uses EXISTS checks and small time windows

-- ============================================================================
-- QUICK CHECK: Do invalid timestamps exist? (Fastest - stops at first match)
-- ============================================================================
SELECT 
  'position_history_future' as check_type,
  EXISTS(
    SELECT 1 FROM position_history 
    WHERE gps_time > NOW() + INTERVAL '1 day'
      AND recorded_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
  ) as has_invalid,
  (SELECT COUNT(*) FROM position_history 
   WHERE gps_time > NOW() + INTERVAL '1 day'
     AND recorded_at >= NOW() - INTERVAL '7 days'
   LIMIT 100) as sample_count

UNION ALL

SELECT 
  'position_history_past' as check_type,
  EXISTS(
    SELECT 1 FROM position_history 
    WHERE gps_time < '2020-01-01'::timestamp
      AND recorded_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
  ) as has_invalid,
  (SELECT COUNT(*) FROM position_history 
   WHERE gps_time < '2020-01-01'::timestamp
     AND recorded_at >= NOW() - INTERVAL '7 days'
   LIMIT 100) as sample_count

UNION ALL

SELECT 
  'vehicle_positions_future' as check_type,
  EXISTS(
    SELECT 1 FROM vehicle_positions 
    WHERE gps_time > NOW() + INTERVAL '1 day'
      AND cached_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
  ) as has_invalid,
  (SELECT COUNT(*) FROM vehicle_positions 
   WHERE gps_time > NOW() + INTERVAL '1 day'
     AND cached_at >= NOW() - INTERVAL '7 days'
   LIMIT 100) as sample_count

UNION ALL

SELECT 
  'vehicle_positions_past' as check_type,
  EXISTS(
    SELECT 1 FROM vehicle_positions 
    WHERE gps_time < '2020-01-01'::timestamp
      AND cached_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
  ) as has_invalid,
  (SELECT COUNT(*) FROM vehicle_positions 
   WHERE gps_time < '2020-01-01'::timestamp
     AND cached_at >= NOW() - INTERVAL '7 days'
   LIMIT 100) as sample_count;

-- ============================================================================
-- SAMPLE RECORDS: Get a few examples (if any exist)
-- ============================================================================
-- Future dates in position_history
SELECT 
  'position_history_future' as source,
  device_id,
  gps_time,
  recorded_at,
  EXTRACT(YEAR FROM gps_time) as year
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '7 days'
ORDER BY gps_time DESC
LIMIT 5;

-- Past dates in position_history
SELECT 
  'position_history_past' as source,
  device_id,
  gps_time,
  recorded_at,
  EXTRACT(YEAR FROM gps_time) as year
FROM position_history
WHERE gps_time < '2020-01-01'::timestamp
  AND recorded_at >= NOW() - INTERVAL '7 days'
ORDER BY gps_time ASC
LIMIT 5;

-- Future dates in vehicle_positions
SELECT 
  'vehicle_positions_future' as source,
  vp.device_id,
  v.device_name,
  vp.gps_time,
  vp.cached_at,
  EXTRACT(YEAR FROM vp.gps_time) as year
FROM vehicle_positions vp
LEFT JOIN vehicles v ON vp.device_id = v.device_id
WHERE vp.gps_time > NOW() + INTERVAL '1 day'
  AND vp.cached_at >= NOW() - INTERVAL '7 days'
ORDER BY vp.gps_time DESC
LIMIT 5;

-- Past dates in vehicle_positions
SELECT 
  'vehicle_positions_past' as source,
  vp.device_id,
  v.device_name,
  vp.gps_time,
  vp.cached_at,
  EXTRACT(YEAR FROM vp.gps_time) as year
FROM vehicle_positions vp
LEFT JOIN vehicles v ON vp.device_id = v.device_id
WHERE vp.gps_time < '2020-01-01'::timestamp
  AND vp.cached_at >= NOW() - INTERVAL '7 days'
ORDER BY vp.gps_time ASC
LIMIT 5;

-- ============================================================================
-- TIMEZONE CHECK: Verify database timezone
-- ============================================================================
SHOW timezone;

SELECT 
  NOW() as utc_time,
  NOW() AT TIME ZONE 'Africa/Lagos' as lagos_time,
  CURRENT_TIMESTAMP as current_timestamp;
