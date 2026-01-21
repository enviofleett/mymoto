-- Debug: Check why backfill isn't finding positions
-- Run these queries to understand the issue

-- =====================================================
-- 1. Sample trips with missing coordinates
-- =====================================================
SELECT 
  id,
  start_time,
  end_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND start_time >= NOW() - INTERVAL '7 days'
  AND (start_latitude = 0 OR end_latitude = 0)
ORDER BY start_time DESC
LIMIT 5;

-- =====================================================
-- 2. Check positions near specific trip times
-- =====================================================
-- Replace TRIP_START_TIME and TRIP_END_TIME with actual values from Query 1
WITH sample_trip AS (
  SELECT 
    id,
    start_time,
    end_time
  FROM vehicle_trips
  WHERE device_id = '358657106048551'
    AND start_time >= NOW() - INTERVAL '7 days'
    AND (start_latitude = 0 OR end_latitude = 0)
  ORDER BY start_time DESC
  LIMIT 1
)
SELECT 
  st.id as trip_id,
  st.start_time,
  st.end_time,
  -- Check positions within ±15 minutes of start
  COUNT(ph.id) FILTER (
    WHERE ph.gps_time >= st.start_time - INTERVAL '15 minutes'
      AND ph.gps_time <= st.start_time + INTERVAL '15 minutes'
      AND ph.latitude != 0
      AND ph.longitude != 0
  ) as positions_near_start,
  -- Check positions within ±15 minutes of end
  COUNT(ph.id) FILTER (
    WHERE ph.gps_time >= st.end_time - INTERVAL '15 minutes'
      AND ph.gps_time <= st.end_time + INTERVAL '15 minutes'
      AND ph.latitude != 0
      AND ph.longitude != 0
  ) as positions_near_end,
  -- Show sample positions near start
  ARRAY_AGG(
    ph.gps_time ORDER BY ph.gps_time
  ) FILTER (
    WHERE ph.gps_time >= st.start_time - INTERVAL '15 minutes'
      AND ph.gps_time <= st.start_time + INTERVAL '15 minutes'
      AND ph.latitude != 0
      AND ph.longitude != 0
  ) as sample_times_near_start
FROM sample_trip st
LEFT JOIN position_history ph ON ph.device_id = '358657106048551'
GROUP BY st.id, st.start_time, st.end_time;

-- =====================================================
-- 3. Check time distribution
-- =====================================================
SELECT 
  DATE_TRUNC('hour', start_time) as trip_hour,
  COUNT(*) as trip_count,
  COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) as missing_coords_count
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND start_time >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', start_time)
ORDER BY trip_hour DESC;

SELECT 
  DATE_TRUNC('hour', gps_time) as position_hour,
  COUNT(*) as position_count
FROM position_history
WHERE device_id = '358657106048551'
  AND gps_time >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', gps_time)
ORDER BY position_hour DESC;
