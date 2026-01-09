-- Event Detection Triggers
-- Automatically detects vehicle events from position updates

-- Trigger function to detect events from position updates
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
  -- Detect if speed increased by more than 30 km/h in one update
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
  -- Detect if speed decreased by more than 40 km/h in one update
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
      p_expires_hours := 2  -- Short expiry for info events
    );
  END IF;

  -- 6. IGNITION OFF EVENT (Trip completed)
  IF NEW.ignition_on = false AND prev_position.ignition_on = true THEN
    -- Calculate trip summary
    DECLARE
      trip_duration INTERVAL;
      trip_distance DECIMAL;
    BEGIN
      -- Get the ignition-on position for this trip
      SELECT
        EXTRACT(EPOCH FROM (NEW.gps_time - ph_start.gps_time)) AS duration_seconds,
        -- Simple distance estimate (would need Haversine for accuracy)
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
        p_event_type := 'trip_completed'::event_type,
        p_severity := 'info'::event_severity,
        p_title := 'Trip Completed',
        p_description := format('Vehicle parked after %s minutes', EXTRACT(EPOCH FROM trip_duration)::INTEGER / 60),
        p_metadata := jsonb_build_object(
          'duration_minutes', EXTRACT(EPOCH FROM trip_duration)::INTEGER / 60,
          'distance_km', COALESCE(trip_distance / 1000.0, 0),
          'final_battery', NEW.battery_percent
        ),
        p_latitude := NEW.latitude,
        p_longitude := NEW.longitude,
        p_expires_hours := 4
      );
    END;
  END IF;

  -- 7. IDLE TOO LONG EVENT
  -- Check if ignition is on but vehicle hasn't moved significantly
  IF NEW.ignition_on = true AND prev_position.ignition_on = true
     AND NEW.speed IS NOT NULL AND NEW.speed < 5  -- Nearly stationary
     AND prev_position.speed IS NOT NULL AND prev_position.speed < 5 THEN

    -- Check how long vehicle has been idle
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
        AND ph.gps_time > NEW.gps_time - INTERVAL '2 hours';  -- Look back max 2 hours

      idle_minutes := EXTRACT(EPOCH FROM idle_duration)::INTEGER / 60;

      -- Only create event if idling for more than threshold
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

-- Create trigger on position_history inserts
CREATE TRIGGER detect_events_on_position_update
AFTER INSERT ON position_history
FOR EACH ROW
EXECUTE FUNCTION detect_vehicle_events();

-- Trigger function to detect online/offline status changes
CREATE OR REPLACE FUNCTION detect_online_status_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Detect vehicle going offline
  IF NEW.is_online = false AND (OLD.is_online IS NULL OR OLD.is_online = true) THEN
    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'offline'::event_type,
      p_severity := 'warning'::event_severity,
      p_title := 'Vehicle Offline',
      p_description := 'Vehicle has lost GPS connection',
      p_metadata := jsonb_build_object(
        'last_seen', NEW.last_updated,
        'last_battery', NEW.battery_percent
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude
    );
  END IF;

  -- Detect vehicle coming back online
  IF NEW.is_online = true AND (OLD.is_online IS NULL OR OLD.is_online = false) THEN
    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'online'::event_type,
      p_severity := 'info'::event_severity,
      p_title := 'Vehicle Online',
      p_description := 'Vehicle has reconnected',
      p_metadata := jsonb_build_object(
        'battery_percent', NEW.battery_percent,
        'ignition_on', NEW.ignition_on
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_expires_hours := 1
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on vehicle_positions updates
CREATE TRIGGER detect_status_changes_on_vehicle_positions
AFTER UPDATE ON vehicle_positions
FOR EACH ROW
EXECUTE FUNCTION detect_online_status_changes();

-- Comments
COMMENT ON FUNCTION detect_vehicle_events IS 'Automatically detects vehicle events from position updates and creates proactive notifications';
COMMENT ON FUNCTION detect_online_status_changes IS 'Detects when vehicles go online or offline and creates events';
