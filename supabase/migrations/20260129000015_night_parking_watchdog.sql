-- Migration: Night Parking Watchdog
-- Description: Detects when a vehicle parks at night (9PM-5AM) away from its "Home" location.

-- 1. Create a function to check night parking status
CREATE OR REPLACE FUNCTION check_night_parking_anomaly()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_device_id TEXT;
  v_latitude DOUBLE PRECISION;
  v_longitude DOUBLE PRECISION;
  v_home_location RECORD;
  v_distance_meters DOUBLE PRECISION;
  v_current_hour INTEGER;
  v_timezone TEXT := 'Africa/Lagos'; -- Default timezone
BEGIN
  -- Only run when ignition turns OFF (vehicle parked)
  IF NEW.ignition_on = false AND (OLD.ignition_on = true OR OLD.ignition_on IS NULL) THEN
    
    v_device_id := NEW.device_id;
    v_latitude := NEW.latitude;
    v_longitude := NEW.longitude;

    -- Get current hour in Lagos time
    v_current_hour := EXTRACT(HOUR FROM (NOW() AT TIME ZONE v_timezone));

    -- Check if it's "Night" (9 PM to 5 AM)
    IF v_current_hour >= 21 OR v_current_hour < 5 THEN
      
      -- Find learned "Home" location for this vehicle
      SELECT * INTO v_home_location
      FROM learned_locations
      WHERE device_id = v_device_id
        AND location_type = 'home'
      ORDER BY confidence_score DESC
      LIMIT 1;

      -- If we know where Home is
      IF FOUND THEN
        -- Calculate distance from Home
        v_distance_meters := (
          ST_Distance(
            ST_SetSRID(ST_MakePoint(v_longitude, v_latitude), 4326)::geography,
            ST_SetSRID(ST_MakePoint(v_home_location.longitude, v_home_location.latitude), 4326)::geography
          )
        );

        -- If parked more than 500m away from Home
        IF v_distance_meters > 500 THEN
          -- Trigger the anomaly event
          INSERT INTO proactive_vehicle_events (
            device_id,
            event_type,
            severity,
            title,
            message,
            metadata
          ) VALUES (
            v_device_id,
            'night_parking_anomaly',
            'warning',
            'Night Parking Anomaly',
            'Vehicle parked away from home at night.',
            jsonb_build_object(
              'home_distance_meters', v_distance_meters,
              'home_name', v_home_location.custom_label || ' (' || v_home_location.location_name || ')',
              'parked_at', NOW()
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Attach trigger to vehicle_positions (current state) on UPDATE
DROP TRIGGER IF EXISTS trigger_night_parking_watchdog ON public.vehicle_positions;

CREATE TRIGGER trigger_night_parking_watchdog
AFTER UPDATE OF ignition_on ON public.vehicle_positions
FOR EACH ROW
EXECUTE FUNCTION check_night_parking_anomaly();
