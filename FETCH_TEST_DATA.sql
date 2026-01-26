-- Fetch raw position history for the device and date
SELECT 
    id, 
    device_id, 
    latitude, 
    longitude, 
    speed, 
    heading, 
    gps_time, 
    ignition_on
FROM public.position_history
WHERE device_id = '358657105966092'
  AND gps_time >= '2026-01-23 00:00:00+00'
  AND gps_time < '2026-01-24 00:00:00+00'
ORDER BY gps_time ASC;

-- Fetch existing trips for the device and date
SELECT 
    id,
    start_time,
    end_time,
    distance_km,
    max_speed,
    avg_speed,
    duration_seconds
FROM public.vehicle_trips
WHERE device_id = '358657105966092'
  AND start_time >= '2026-01-23 00:00:00+00'
  AND start_time < '2026-01-24 00:00:00+00'
ORDER BY start_time ASC;
