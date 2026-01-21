-- ============================================
-- Complete Timezone Setup - Run All Steps
-- ============================================

-- Step 1: Set timezone
SET timezone = 'Africa/Lagos';

-- Step 2: Verify timezone
SHOW timezone;

-- Step 3: Check for invalid timestamps
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
   LIMIT 100) as sample_count;

-- Step 4: Show sample invalid timestamps (if any)
SELECT 
  'position_history_future' as source,
  device_id,
  gps_time,
  EXTRACT(YEAR FROM gps_time) as year
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '7 days'
ORDER BY gps_time DESC
LIMIT 5;

SELECT 
  'vehicle_positions_future' as source,
  device_id,
  gps_time,
  EXTRACT(YEAR FROM gps_time) as year
FROM vehicle_positions
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND cached_at >= NOW() - INTERVAL '7 days'
ORDER BY gps_time DESC
LIMIT 5;

-- Step 5: Test timezone conversion
SELECT 
  NOW() as current_time,
  NOW() AT TIME ZONE 'Africa/Lagos' as lagos_time;
