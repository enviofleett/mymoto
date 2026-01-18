-- Location Learning Triggers
-- Automatically learns locations from parking/idle patterns

-- Table to track parking sessions
CREATE TABLE public.parking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,

  -- Location
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,

  -- Time tracking
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,

  -- Status
  is_active BOOLEAN DEFAULT true,
  learned_location_id UUID REFERENCES learned_locations(id),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

CREATE INDEX idx_parking_sessions_device_active ON parking_sessions(device_id, is_active);
CREATE INDEX idx_parking_sessions_device_time ON parking_sessions(device_id, start_time DESC);

-- Enable RLS
ALTER TABLE public.parking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view parking sessions"
ON public.parking_sessions FOR SELECT
USING (true);

-- Trigger function to detect parking sessions and learn locations
CREATE OR REPLACE FUNCTION detect_parking_and_learn_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prev_position RECORD;
  active_session RECORD;
  session_duration INTEGER;
  learned_loc_id UUID;
  min_parking_duration INTEGER := 15; -- Minimum 15 minutes to be considered "parking"
BEGIN
  -- Get previous position
  SELECT * INTO prev_position
  FROM position_history
  WHERE device_id = NEW.device_id
    AND id != NEW.id
  ORDER BY gps_time DESC
  LIMIT 1;

  -- Skip if no previous position
  IF prev_position IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for active parking session
  SELECT * INTO active_session
  FROM parking_sessions
  WHERE device_id = NEW.device_id
    AND is_active = true
  ORDER BY start_time DESC
  LIMIT 1;

  -- CASE 1: Vehicle just parked (ignition turned off)
  IF NEW.ignition_on = false AND prev_position.ignition_on = true THEN
    -- Start new parking session
    INSERT INTO parking_sessions (
      device_id,
      latitude,
      longitude,
      start_time,
      is_active
    ) VALUES (
      NEW.device_id,
      NEW.latitude,
      NEW.longitude,
      NEW.gps_time,
      true
    );

    RAISE NOTICE 'Started parking session for device %', NEW.device_id;

  -- CASE 2: Vehicle is starting (ignition turned on)
  ELSIF NEW.ignition_on = true AND prev_position.ignition_on = false THEN
    IF active_session.id IS NOT NULL THEN
      -- End the parking session
      session_duration := EXTRACT(EPOCH FROM (NEW.gps_time - active_session.start_time))::INTEGER / 60;

      UPDATE parking_sessions
      SET
        end_time = NEW.gps_time,
        duration_minutes = session_duration,
        is_active = false
      WHERE id = active_session.id;

      -- If parked long enough, learn the location
      IF session_duration >= min_parking_duration THEN
        learned_loc_id := update_learned_location(
          p_device_id := NEW.device_id,
          p_latitude := active_session.latitude,
          p_longitude := active_session.longitude,
          p_duration_minutes := session_duration,
          p_clustering_radius := 50
        );

        -- Link session to learned location
        UPDATE parking_sessions
        SET learned_location_id = learned_loc_id
        WHERE id = active_session.id;

        -- Classify the location type if enough visits
        PERFORM classify_location_type(learned_loc_id);

        RAISE NOTICE 'Learned location % for device % (duration: % min)', learned_loc_id, NEW.device_id, session_duration;
      END IF;
    END IF;

  -- CASE 3: Check for extended idle (ignition on but not moving)
  ELSIF NEW.ignition_on = true AND NEW.speed < 2 AND prev_position.speed < 2 THEN
    -- Check if there's an active idle session in parking_sessions
    IF active_session.id IS NULL THEN
      -- Check how long vehicle has been idle
      DECLARE
        idle_start TIMESTAMP WITH TIME ZONE;
        idle_duration INTEGER;
      BEGIN
        SELECT MIN(gps_time) INTO idle_start
        FROM position_history
        WHERE device_id = NEW.device_id
          AND speed < 2
          AND ignition_on = true
          AND gps_time > NEW.gps_time - INTERVAL '2 hours';

        IF idle_start IS NOT NULL THEN
          idle_duration := EXTRACT(EPOCH FROM (NEW.gps_time - idle_start))::INTEGER / 60;

          -- If idle for 30+ minutes, treat as parking
          IF idle_duration >= 30 THEN
            INSERT INTO parking_sessions (
              device_id,
              latitude,
              longitude,
              start_time,
              is_active
            ) VALUES (
              NEW.device_id,
              NEW.latitude,
              NEW.longitude,
              idle_start,
              true
            );

            RAISE NOTICE 'Created idle parking session for device % (idle for % min)', NEW.device_id, idle_duration;
          END IF;
        END IF;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on position_history
CREATE TRIGGER learn_locations_from_parking
AFTER INSERT ON position_history
FOR EACH ROW
EXECUTE FUNCTION detect_parking_and_learn_location();

-- Function to manually trigger location learning (for historical data)
CREATE OR REPLACE FUNCTION learn_locations_from_history(
  p_device_id TEXT,
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  locations_learned INTEGER,
  sessions_processed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  parking_record RECORD;
  learned_count INTEGER := 0;
  session_count INTEGER := 0;
  learned_loc_id UUID;
BEGIN
  -- Find parking sessions from position_history
  FOR parking_record IN
    WITH ignition_changes AS (
      SELECT
        device_id,
        latitude,
        longitude,
        gps_time,
        ignition_on,
        LAG(ignition_on) OVER (PARTITION BY device_id ORDER BY gps_time) AS prev_ignition,
        LEAD(gps_time) OVER (PARTITION BY device_id ORDER BY gps_time) AS next_time,
        LEAD(ignition_on) OVER (PARTITION BY device_id ORDER BY gps_time) AS next_ignition
      FROM position_history
      WHERE device_id = p_device_id
        AND gps_time >= now() - (p_days_back || ' days')::INTERVAL
    )
    SELECT
      ic.latitude,
      ic.longitude,
      ic.gps_time AS start_time,
      ic.next_time AS end_time,
      EXTRACT(EPOCH FROM (ic.next_time - ic.gps_time))::INTEGER / 60 AS duration_minutes
    FROM ignition_changes ic
    WHERE
      ic.ignition_on = false
      AND ic.prev_ignition = true
      AND ic.next_ignition = true
      AND ic.next_time IS NOT NULL
      AND EXTRACT(EPOCH FROM (ic.next_time - ic.gps_time))::INTEGER / 60 >= 15
    ORDER BY ic.gps_time DESC
    LIMIT 100
  LOOP
    session_count := session_count + 1;

    -- Learn this location
    learned_loc_id := update_learned_location(
      p_device_id := p_device_id,
      p_latitude := parking_record.latitude,
      p_longitude := parking_record.longitude,
      p_duration_minutes := parking_record.duration_minutes,
      p_clustering_radius := 50
    );

    IF learned_loc_id IS NOT NULL THEN
      learned_count := learned_count + 1;

      -- Classify the location
      PERFORM classify_location_type(learned_loc_id);
    END IF;
  END LOOP;

  RETURN QUERY SELECT learned_count, session_count;
END;
$$;

GRANT EXECUTE ON FUNCTION learn_locations_from_history TO authenticated, service_role;

-- Function to calculate visits per week
CREATE OR REPLACE FUNCTION update_location_visit_frequency()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE learned_locations ll
  SET
    visits_per_week = (
      SELECT COUNT(*)::DECIMAL / GREATEST(EXTRACT(EPOCH FROM (now() - ll.first_visit_at))::DECIMAL / 604800, 1)
      FROM parking_sessions ps
      WHERE ps.learned_location_id = ll.id
        AND ps.is_active = false
    ),
    typical_duration_minutes = (
      SELECT AVG(duration_minutes)::INTEGER
      FROM parking_sessions ps
      WHERE ps.learned_location_id = ll.id
        AND ps.is_active = false
        AND ps.duration_minutes IS NOT NULL
    ),
    updated_at = now()
  WHERE ll.visit_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION update_location_visit_frequency TO service_role;

-- Function to get current location context
CREATE OR REPLACE FUNCTION get_current_location_context(
  p_device_id TEXT,
  p_latitude DECIMAL,
  p_longitude DECIMAL
)
RETURNS TABLE (
  at_learned_location BOOLEAN,
  location_id UUID,
  location_name TEXT,
  location_type TEXT,
  custom_label TEXT,
  visit_count INTEGER,
  typical_duration_minutes INTEGER,
  last_visit_days_ago INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  nearby_loc RECORD;
BEGIN
  -- Find nearby learned location
  SELECT * INTO nearby_loc
  FROM find_nearby_learned_location(
    p_device_id := p_device_id,
    p_latitude := p_latitude,
    p_longitude := p_longitude,
    p_radius_meters := 100
  );

  IF nearby_loc.id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      true AS at_learned_location,
      nearby_loc.id,
      nearby_loc.location_name,
      nearby_loc.location_type,
      nearby_loc.custom_label,
      nearby_loc.visit_count,
      ll.typical_duration_minutes,
      EXTRACT(DAYS FROM (now() - ll.last_visit_at))::INTEGER AS last_visit_days_ago
    FROM learned_locations ll
    WHERE ll.id = nearby_loc.id;
  ELSE
    RETURN QUERY
    SELECT
      false,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::INTEGER,
      NULL::INTEGER,
      NULL::INTEGER;
  END IF;
END;
$$;

-- Grant and comments use specific function signature to avoid ambiguity
-- Note: If function already exists with DOUBLE PRECISION signature (from later migration),
-- this will update it to use DECIMAL which is compatible
GRANT EXECUTE ON FUNCTION get_current_location_context(TEXT, DECIMAL, DECIMAL) TO authenticated;

-- Comments
COMMENT ON TABLE parking_sessions IS 'Tracks individual parking sessions for learning location patterns';
COMMENT ON FUNCTION detect_parking_and_learn_location IS 'Automatically detects parking sessions and learns location patterns';
COMMENT ON FUNCTION learn_locations_from_history IS 'Analyzes historical position data to learn frequent locations (use for initial setup)';
COMMENT ON FUNCTION update_location_visit_frequency IS 'Updates visit frequency statistics for all learned locations';
COMMENT ON FUNCTION get_current_location_context(TEXT, DECIMAL, DECIMAL) IS 'Returns context about the current location if it matches a learned location';
