-- SQL Command to get trip details for device 358657105966092 for TODAY only
-- Note: 'CURRENT_DATE' uses the database server's timezone (usually UTC).
-- If you need a specific timezone (e.g., Lagos), use: start_time AT TIME ZONE 'Africa/Lagos'

SELECT 
    id as trip_id,
    start_time,
    end_time,
    -- Calculate duration in minutes for readability
    ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 60, 1) as duration_minutes,
    distance_km,
    max_speed,
    avg_speed,
    start_address,
    end_address,
    source,
    created_at
FROM 
    vehicle_trips
WHERE 
    device_id = '358657105966092'
    AND start_time >= CURRENT_DATE
ORDER BY 
    start_time DESC;
