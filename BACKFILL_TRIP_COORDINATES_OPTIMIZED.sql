-- Optimized backfill script that processes trips in batches to avoid timeouts
-- Run this script multiple times until all trips are backfilled

-- Step 1: Backfill start coordinates (process 100 trips at a time)
UPDATE vehicle_trips vt
SET 
  start_latitude = ph.latitude,
  start_longitude = ph.longitude
FROM (
  SELECT 
    vt.id,
    (
      SELECT latitude
      FROM position_history ph
      WHERE ph.device_id = vt.device_id
        AND ph.gps_time >= vt.start_time - INTERVAL '5 minutes'
        AND ph.gps_time <= vt.start_time + INTERVAL '5 minutes'
        AND ph.latitude IS NOT NULL
        AND ph.longitude IS NOT NULL
        AND ph.latitude != 0
        AND ph.longitude != 0
      ORDER BY ABS(EXTRACT(EPOCH FROM (ph.gps_time - vt.start_time)))
      LIMIT 1
    ) as latitude,
    (
      SELECT longitude
      FROM position_history ph
      WHERE ph.device_id = vt.device_id
        AND ph.gps_time >= vt.start_time - INTERVAL '5 minutes'
        AND ph.gps_time <= vt.start_time + INTERVAL '5 minutes'
        AND ph.latitude IS NOT NULL
        AND ph.longitude IS NOT NULL
        AND ph.latitude != 0
        AND ph.longitude != 0
      ORDER BY ABS(EXTRACT(EPOCH FROM (ph.gps_time - vt.start_time)))
      LIMIT 1
    ) as longitude
  FROM vehicle_trips vt
  WHERE (vt.start_latitude = 0 OR vt.start_longitude = 0)
    AND vt.device_id = '358657105967694'
    AND vt.start_time >= '2026-01-08 00:00:00+00'
  LIMIT 100
) ph
WHERE vt.id = ph.id
  AND ph.latitude IS NOT NULL
  AND ph.longitude IS NOT NULL;

-- Step 2: Backfill end coordinates (process 100 trips at a time)
UPDATE vehicle_trips vt
SET 
  end_latitude = ph.latitude,
  end_longitude = ph.longitude
FROM (
  SELECT 
    vt.id,
    (
      SELECT latitude
      FROM position_history ph
      WHERE ph.device_id = vt.device_id
        AND ph.gps_time >= vt.end_time - INTERVAL '5 minutes'
        AND ph.gps_time <= vt.end_time + INTERVAL '5 minutes'
        AND ph.latitude IS NOT NULL
        AND ph.longitude IS NOT NULL
        AND ph.latitude != 0
        AND ph.longitude != 0
      ORDER BY ABS(EXTRACT(EPOCH FROM (ph.gps_time - vt.end_time)))
      LIMIT 1
    ) as latitude,
    (
      SELECT longitude
      FROM position_history ph
      WHERE ph.device_id = vt.device_id
        AND ph.gps_time >= vt.end_time - INTERVAL '5 minutes'
        AND ph.gps_time <= vt.end_time + INTERVAL '5 minutes'
        AND ph.latitude IS NOT NULL
        AND ph.longitude IS NOT NULL
        AND ph.latitude != 0
        AND ph.longitude != 0
      ORDER BY ABS(EXTRACT(EPOCH FROM (ph.gps_time - vt.end_time)))
      LIMIT 1
    ) as longitude
  FROM vehicle_trips vt
  WHERE (vt.end_latitude = 0 OR vt.end_longitude = 0)
    AND vt.device_id = '358657105967694'
    AND vt.start_time >= '2026-01-08 00:00:00+00'
  LIMIT 100
) ph
WHERE vt.id = ph.id
  AND ph.latitude IS NOT NULL
  AND ph.longitude IS NOT NULL;

-- Step 3: Recalculate distance for trips that now have valid coordinates
UPDATE vehicle_trips
SET distance_km = (
  6371 * acos(
    LEAST(1.0, GREATEST(-1.0,
      cos(radians(start_latitude)) * 
      cos(radians(end_latitude)) * 
      cos(radians(end_longitude) - radians(start_longitude)) + 
      sin(radians(start_latitude)) * 
      sin(radians(end_latitude))
    ))
  )
)
WHERE (start_latitude != 0 AND start_longitude != 0 AND end_latitude != 0 AND end_longitude != 0)
  AND (distance_km = 0 OR distance_km IS NULL)
  AND device_id = '358657105967694'
  AND start_time >= '2026-01-08 00:00:00+00'
LIMIT 100;

-- Check progress
SELECT 
  COUNT(*) as total_trips,
  COUNT(CASE WHEN start_latitude = 0 OR start_longitude = 0 THEN 1 END) as missing_start_coords,
  COUNT(CASE WHEN end_latitude = 0 OR end_longitude = 0 THEN 1 END) as missing_end_coords,
  COUNT(CASE WHEN start_latitude != 0 AND start_longitude != 0 AND end_latitude != 0 AND end_longitude != 0 THEN 1 END) as has_all_coords
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= '2026-01-08 00:00:00+00';
