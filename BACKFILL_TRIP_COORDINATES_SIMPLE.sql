-- Simple, fast backfill script - run multiple times until all trips are updated
-- This version uses a simpler approach that's less likely to timeout

-- Backfill start coordinates (processes 50 trips at a time)
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
        AND ph.gps_time BETWEEN vt.start_time - INTERVAL '5 minutes' AND vt.start_time + INTERVAL '5 minutes'
        AND ph.latitude IS NOT NULL
        AND ph.longitude IS NOT NULL
        AND ph.latitude != 0
        AND ph.longitude != 0
      ORDER BY ph.gps_time
      LIMIT 1
    ) as latitude,
    (
      SELECT longitude
      FROM position_history ph
      WHERE ph.device_id = vt.device_id
        AND ph.gps_time BETWEEN vt.start_time - INTERVAL '5 minutes' AND vt.start_time + INTERVAL '5 minutes'
        AND ph.latitude IS NOT NULL
        AND ph.longitude IS NOT NULL
        AND ph.latitude != 0
        AND ph.longitude != 0
      ORDER BY ph.gps_time
      LIMIT 1
    ) as longitude
  FROM vehicle_trips vt
  WHERE (vt.start_latitude = 0 OR vt.start_longitude = 0)
    AND vt.device_id = '358657105967694'
    AND vt.start_time >= '2026-01-08 00:00:00+00'
  LIMIT 50
) ph
WHERE vt.id = ph.id
  AND ph.latitude IS NOT NULL
  AND ph.longitude IS NOT NULL;

-- Backfill end coordinates (processes 50 trips at a time)
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
        AND ph.gps_time BETWEEN vt.end_time - INTERVAL '5 minutes' AND vt.end_time + INTERVAL '5 minutes'
        AND ph.latitude IS NOT NULL
        AND ph.longitude IS NOT NULL
        AND ph.latitude != 0
        AND ph.longitude != 0
      ORDER BY ph.gps_time DESC
      LIMIT 1
    ) as latitude,
    (
      SELECT longitude
      FROM position_history ph
      WHERE ph.device_id = vt.device_id
        AND ph.gps_time BETWEEN vt.end_time - INTERVAL '5 minutes' AND vt.end_time + INTERVAL '5 minutes'
        AND ph.latitude IS NOT NULL
        AND ph.longitude IS NOT NULL
        AND ph.latitude != 0
        AND ph.longitude != 0
      ORDER BY ph.gps_time DESC
      LIMIT 1
    ) as longitude
  FROM vehicle_trips vt
  WHERE (vt.end_latitude = 0 OR vt.end_longitude = 0)
    AND vt.device_id = '358657105967694'
    AND vt.start_time >= '2026-01-08 00:00:00+00'
  LIMIT 50
) ph
WHERE vt.id = ph.id
  AND ph.latitude IS NOT NULL
  AND ph.longitude IS NOT NULL;

-- Recalculate distance (processes 50 trips at a time)
UPDATE vehicle_trips vt
SET distance_km = ROUND(
  6371 * acos(
    LEAST(1.0, GREATEST(-1.0,
      cos(radians(vt.start_latitude)) * 
      cos(radians(vt.end_latitude)) * 
      cos(radians(vt.end_longitude) - radians(vt.start_longitude)) + 
      sin(radians(vt.start_latitude)) * 
      sin(radians(vt.end_latitude))
    ))
  )::numeric,
  2
)
FROM (
  SELECT id
  FROM vehicle_trips
  WHERE (start_latitude != 0 AND start_longitude != 0 AND end_latitude != 0 AND end_longitude != 0)
    AND (distance_km = 0 OR distance_km IS NULL)
    AND device_id = '358657105967694'
    AND start_time >= '2026-01-08 00:00:00+00'
  LIMIT 50
) trips_to_update
WHERE vt.id = trips_to_update.id;
