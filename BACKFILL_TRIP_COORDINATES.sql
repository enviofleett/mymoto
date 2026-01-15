-- Backfill missing trip coordinates from position_history
-- This will update trips that have 0,0 coordinates with actual GPS data

UPDATE vehicle_trips vt
SET 
  start_latitude = ph_start.latitude,
  start_longitude = ph_start.longitude
FROM (
  SELECT DISTINCT ON (vt.id)
    vt.id,
    ph.latitude,
    ph.longitude
  FROM vehicle_trips vt
  CROSS JOIN LATERAL (
    SELECT latitude, longitude
    FROM position_history
    WHERE device_id = vt.device_id
      AND gps_time >= vt.start_time - INTERVAL '5 minutes'
      AND gps_time <= vt.start_time + INTERVAL '5 minutes'
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND latitude != 0
      AND longitude != 0
    ORDER BY ABS(EXTRACT(EPOCH FROM (gps_time - vt.start_time)))
    LIMIT 1
  ) ph
  WHERE vt.start_latitude = 0 OR vt.start_longitude = 0
) ph_start
WHERE vt.id = ph_start.id;

UPDATE vehicle_trips vt
SET 
  end_latitude = ph_end.latitude,
  end_longitude = ph_end.longitude
FROM (
  SELECT DISTINCT ON (vt.id)
    vt.id,
    ph.latitude,
    ph.longitude
  FROM vehicle_trips vt
  CROSS JOIN LATERAL (
    SELECT latitude, longitude
    FROM position_history
    WHERE device_id = vt.device_id
      AND gps_time >= vt.end_time - INTERVAL '5 minutes'
      AND gps_time <= vt.end_time + INTERVAL '5 minutes'
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND latitude != 0
      AND longitude != 0
    ORDER BY ABS(EXTRACT(EPOCH FROM (gps_time - vt.end_time)))
    LIMIT 1
  ) ph
  WHERE vt.end_latitude = 0 OR vt.end_longitude = 0
) ph_end
WHERE vt.id = ph_end.id;

-- Recalculate distance for trips that now have valid coordinates
UPDATE vehicle_trips
SET distance_km = (
  6371 * acos(
    cos(radians(start_latitude)) * 
    cos(radians(end_latitude)) * 
    cos(radians(end_longitude) - radians(start_longitude)) + 
    sin(radians(start_latitude)) * 
    sin(radians(end_latitude))
  )
)
WHERE (start_latitude != 0 AND start_longitude != 0 AND end_latitude != 0 AND end_longitude != 0)
  AND (distance_km = 0 OR distance_km IS NULL);

-- Check results
SELECT 
  COUNT(*) as total_trips,
  COUNT(CASE WHEN start_latitude = 0 OR start_longitude = 0 THEN 1 END) as missing_start_coords,
  COUNT(CASE WHEN end_latitude = 0 OR end_longitude = 0 THEN 1 END) as missing_end_coords,
  COUNT(CASE WHEN start_latitude != 0 AND start_longitude != 0 AND end_latitude != 0 AND end_longitude != 0 THEN 1 END) as has_all_coords
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= '2026-01-08 00:00:00+00';
