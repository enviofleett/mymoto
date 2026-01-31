
-- Fix vehicle_moving event detection logic
-- Re-applies the detect_vehicle_events function to ensure the logic is active.

-- Ensure the enum value exists (just in case)
DO $$ 
DECLARE
  value_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'event_type'
    AND n.nspname = 'public'
    AND e.enumlabel = 'vehicle_moving'
  ) INTO value_exists;
  
  IF NOT value_exists THEN
    ALTER TYPE public.event_type ADD VALUE 'vehicle_moving';
  END IF;
END $$;

-- Update the function
CREATE OR REPLACE FUNCTION detect_vehicle_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prev_position RECORD;
  speed_threshold DECIMAL := 100; -- km/h
  battery_low_threshold DECIMAL := 20; -- %
  battery_critical_threshold DECIMAL := 10; -- %
  idle_threshold_minutes INTEGER := 30; -- minutes
  movement_speed_threshold DECIMAL := 5; -- km/h - minimum speed to consider "moving"
BEGIN
  -- Get previous position for comparison
  SELECT * INTO prev_position
  FROM position_history
  WHERE device_id = NEW.device_id
    AND id != NEW.id
  ORDER BY gps_time DESC
  LIMIT 1;

  -- Skip if no previous position (first record)
  IF prev_position IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. LOW BATTERY EVENT
  IF NEW.battery_percent IS NOT NULL AND NEW.battery_percent < battery_low_threshold
     AND (prev_position.battery_percent IS NULL OR prev_position.battery_percent >= battery_low_threshold) THEN

    IF NEW.battery_percent < battery_critical_threshold THEN
      -- Critical battery
      PERFORM create_proactive_event(
        p_device_id := NEW.device_id,
        p_event_type := 'critical_battery'::event_type,
        p_severity := 'critical'::event_severity,
        p_title := 'Critical Battery Level',
        p_description := format('Battery dropped to %s%%. Immediate attention required.', NEW.battery_percent),
        p_metadata := jsonb_build_object(
          'battery_percent', NEW.battery_percent,
          'previous_percent', prev_position.battery_percent
        ),
        p_latitude := NEW.latitude,
        p_longitude := NEW.longitude,
        p_value_before := prev_position.battery_percent,
        p_value_after := NEW.battery_percent,
        p_threshold := battery_critical_threshold
      );
    ELSE
      -- Low battery
      PERFORM create_proactive_event(
        p_device_id := NEW.device_id,
        p_event_type := 'low_battery'::event_type,
        p_severity := 'warning'::event_severity,
        p_title := 'Low Battery Warning',
        p_description := format('Battery at %s%%. Consider charging soon.', NEW.battery_percent),
        p_metadata := jsonb_build_object(
          'battery_percent', NEW.battery_percent,
          'previous_percent', prev_position.battery_percent
        ),
        p_latitude := NEW.latitude,
        p_longitude := NEW.longitude,
        p_value_before := prev_position.battery_percent,
        p_value_after := NEW.battery_percent,
        p_threshold := battery_low_threshold
      );
    END IF;
  END IF;

  -- 2. OVERSPEEDING EVENT
  IF NEW.speed IS NOT NULL AND NEW.speed > speed_threshold
     AND (prev_position.speed IS NULL OR prev_position.speed <= speed_threshold) THEN

    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'overspeeding'::event_type,
      p_severity := 'error'::event_severity,
      p_title := 'Overspeeding Detected',
      p_description := format('Vehicle speed reached %s km/h (limit: %s km/h)', NEW.speed, speed_threshold),
      p_metadata := jsonb_build_object(
        'speed', NEW.speed,
        'threshold', speed_threshold,
        'previous_speed', prev_position.speed
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_value_before := prev_position.speed,
      p_value_after := NEW.speed,
      p_threshold := speed_threshold
    );
  END IF;

  -- 3. RAPID ACCELERATION EVENT
  IF NEW.speed IS NOT NULL AND prev_position.speed IS NOT NULL
     AND (NEW.speed - prev_position.speed) > 30 THEN

    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'rapid_acceleration'::event_type,
      p_severity := 'warning'::event_severity,
      p_title := 'Rapid Acceleration',
      p_description := format('Speed increased rapidly from %s to %s km/h', prev_position.speed, NEW.speed),
      p_metadata := jsonb_build_object(
        'speed_before', prev_position.speed,
        'speed_after', NEW.speed,
        'delta', NEW.speed - prev_position.speed
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_value_before := prev_position.speed,
      p_value_after := NEW.speed
    );
  END IF;

  -- 4. HARSH BRAKING EVENT
  IF NEW.speed IS NOT NULL AND prev_position.speed IS NOT NULL
     AND (prev_position.speed - NEW.speed) > 40 THEN

    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'harsh_braking'::event_type,
      p_severity := 'warning'::event_severity,
      p_title := 'Harsh Braking Detected',
      p_description := format('Speed dropped rapidly from %s to %s km/h', prev_position.speed, NEW.speed),
      p_metadata := jsonb_build_object(
        'speed_before', prev_position.speed,
        'speed_after', NEW.speed,
        'delta', prev_position.speed - NEW.speed
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_value_before := prev_position.speed,
      p_value_after := NEW.speed
    );
  END IF;

  -- 5. IGNITION ON EVENT
  IF NEW.ignition_on = true AND prev_position.ignition_on = false THEN
    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'ignition_on'::event_type,
      p_severity := 'info'::event_severity,
      p_title := 'Vehicle Started',
      p_description := 'Ignition turned on, vehicle is now active',
      p_metadata := jsonb_build_object(
        'battery_percent', NEW.battery_percent,
        'location_lat', NEW.latitude,
        'location_lon', NEW.longitude
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_expires_hours := 2
    );
  END IF;

  -- 6. VEHICLE MOVING EVENT (Explicitly Checked)
  -- Detect when vehicle starts moving (speed transitions from <=5 to >5 km/h)
  IF NEW.ignition_on = true 
     AND NEW.speed IS NOT NULL AND NEW.speed > movement_speed_threshold
     AND (prev_position.speed IS NULL OR prev_position.speed <= movement_speed_threshold) THEN
    
    -- Check cooldown (10 minutes)
    DECLARE
      last_moving_event TIMESTAMPTZ;
    BEGIN
      SELECT MAX(created_at) INTO last_moving_event
      FROM proactive_vehicle_events
      WHERE device_id = NEW.device_id
        AND event_type = 'vehicle_moving'
        AND created_at > NOW() - INTERVAL '10 minutes';
      
      IF last_moving_event IS NULL THEN
        PERFORM create_proactive_event(
          p_device_id := NEW.device_id,
          p_event_type := 'vehicle_moving'::event_type,
          p_severity := 'info'::event_severity,
          p_title := 'Vehicle Started Moving',
          p_description := format('Vehicle is now moving at %s km/h', ROUND(NEW.speed::numeric, 0)),
          p_metadata := jsonb_build_object(
            'speed', NEW.speed,
            'previous_speed', prev_position.speed,
            'ignition_on', NEW.ignition_on
          ),
          p_latitude := NEW.latitude,
          p_longitude := NEW.longitude,
          p_value_before := prev_position.speed,
          p_value_after := NEW.speed,
          p_expires_hours := 1
        );
      END IF;
    END;
  END IF;

  -- 7. IGNITION OFF EVENT
  IF NEW.ignition_on = false AND prev_position.ignition_on = true THEN
    -- Calculate trip summary
    DECLARE
      trip_duration INTERVAL;
      trip_distance DECIMAL;
    BEGIN
      SELECT
        EXTRACT(EPOCH FROM (NEW.gps_time - ph_start.gps_time)) AS duration_seconds,
        (NEW.total_mileage - ph_start.total_mileage) AS distance_meters
      INTO trip_duration, trip_distance
      FROM position_history ph_start
      WHERE ph_start.device_id = NEW.device_id
        AND ph_start.ignition_on = true
        AND ph_start.gps_time < NEW.gps_time
      ORDER BY ph_start.gps_time DESC
      LIMIT 1;

      PERFORM create_proactive_event(
        p_device_id := NEW.device_id,
        p_event_type := 'ignition_off'::event_type,
        p_severity := 'info'::event_severity,
        p_title := 'Engine Stopped',
        p_description := format('Vehicle engine has been turned off%s', 
          CASE WHEN trip_duration IS NOT NULL 
            THEN format(' after %s minutes', EXTRACT(EPOCH FROM trip_duration)::INTEGER / 60)
            ELSE ''
          END),
        p_metadata := jsonb_build_object(
          'duration_minutes', CASE WHEN trip_duration IS NOT NULL 
            THEN EXTRACT(EPOCH FROM trip_duration)::INTEGER / 60 
            ELSE NULL END,
          'distance_km', COALESCE(trip_distance / 1000.0, 0),
          'final_battery', NEW.battery_percent,
          'location_lat', NEW.latitude,
          'location_lon', NEW.longitude
        ),
        p_latitude := NEW.latitude,
        p_longitude := NEW.longitude,
        p_expires_hours := 2
      );
    END;
  END IF;

  -- 8. IDLE TOO LONG EVENT
  IF NEW.ignition_on = true AND prev_position.ignition_on = true
     AND NEW.speed IS NOT NULL AND NEW.speed < 5
     AND prev_position.speed IS NOT NULL AND prev_position.speed < 5 THEN

    DECLARE
      idle_duration INTERVAL;
      idle_minutes INTEGER;
    BEGIN
      SELECT
        NEW.gps_time - MIN(ph.gps_time)
      INTO idle_duration
      FROM position_history ph
      WHERE ph.device_id = NEW.device_id
        AND ph.ignition_on = true
        AND ph.speed < 5
        AND ph.gps_time <= NEW.gps_time
        AND ph.gps_time > NEW.gps_time - INTERVAL '2 hours';

      idle_minutes := EXTRACT(EPOCH FROM idle_duration)::INTEGER / 60;

      IF idle_minutes >= idle_threshold_minutes THEN
        PERFORM create_proactive_event(
          p_device_id := NEW.device_id,
          p_event_type := 'idle_too_long'::event_type,
          p_severity := 'warning'::event_severity,
          p_title := 'Extended Idle Time',
          p_description := format('Vehicle has been idling for %s minutes', idle_minutes),
          p_metadata := jsonb_build_object(
            'idle_minutes', idle_minutes,
            'battery_percent', NEW.battery_percent,
            'threshold_minutes', idle_threshold_minutes
          ),
          p_latitude := NEW.latitude,
          p_longitude := NEW.longitude,
          p_threshold := idle_threshold_minutes
        );
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$;
