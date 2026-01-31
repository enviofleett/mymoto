-- Fetch trips for device RBC784CX (358657105966092) on 2026-01-30 to analyze Trip 3 and Trip 4
DO $$
DECLARE
    v_device_id text := '358657105966092';
    r record;
    i integer := 1;
BEGIN
    RAISE NOTICE 'Listing trips for device % on Jan 30:', v_device_id;
    
    FOR r IN 
        SELECT 
            id, 
            start_time, 
            end_time, 
            start_latitude, 
            start_longitude, 
            end_latitude, 
            end_longitude, 
            distance_km
        FROM vehicle_trips
        WHERE device_id = v_device_id
        AND start_time >= '2026-01-29 23:00:00+00' -- Jan 30 Lagos time
        ORDER BY start_time ASC
    LOOP
        RAISE NOTICE 'Trip %: Start[%] End[%] Dist[%]km Coords: (% , %) -> (% , %)', 
            i, 
            r.start_time, 
            r.end_time, 
            r.distance_km,
            r.start_latitude, r.start_longitude,
            r.end_latitude, r.end_longitude;
        i := i + 1;
    END LOOP;
END $$;
