-- Geofence Entry/Exit Detection Triggers
-- Automatically detects when vehicles enter or exit geofence zones

-- Table to track current geofence status
CREATE TABLE public.vehicle_geofence_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  geofence_id UUID REFERENCES geofence_zones(id) ON DELETE CASCADE,

  -- Entry details
  entered_at TIMESTAMP WITH TIME ZONE,
  entry_latitude DECIMAL(10, 8),
  entry_longitude DECIMAL(11, 8),

  -- Current status
  is_inside BOOLEAN DEFAULT false,
  last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

CREATE INDEX idx_vehicle_geofence_status_device ON vehicle_geofence_status(device_id);
CREATE INDEX idx_vehicle_geofence_status_geofence ON vehicle_geofence_status(geofence_id);

-- Enable RLS
ALTER TABLE public.vehicle_geofence_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view geofence status"
ON public.vehicle_geofence_status FOR SELECT
USING (true);

-- Trigger function to detect geofence entry/exit
CREATE OR REPLACE FUNCTION detect_geofence_crossings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_geofence RECORD;
  previous_status RECORD;
  entry_duration INTEGER;
BEGIN
  -- Get current geofence status for this location
  SELECT * INTO current_geofence
  FROM check_geofence_status(NEW.device_id, NEW.latitude, NEW.longitude);

  -- Get previous geofence status
  SELECT * INTO previous_status
  FROM vehicle_geofence_status
  WHERE device_id = NEW.device_id;

  -- CASE 1: Vehicle just entered a geofence
  IF current_geofence.inside_geofence
     AND (previous_status IS NULL OR NOT previous_status.is_inside
          OR previous_status.geofence_id != current_geofence.geofence_id) THEN

    -- Log entry event
    INSERT INTO geofence_events (
      geofence_id,
      device_id,
      event_type,
      event_time,
      latitude,
      longitude,
      speed
    ) VALUES (
      current_geofence.geofence_id,
      NEW.device_id,
      'entry',
      NEW.gps_time,
      NEW.latitude,
      NEW.longitude,
      NEW.speed
    );

    -- Update status
    INSERT INTO vehicle_geofence_status (
      device_id,
      geofence_id,
      is_inside,
      entered_at,
      entry_latitude,
      entry_longitude,
      last_checked_at
    ) VALUES (
      NEW.device_id,
      current_geofence.geofence_id,
      true,
      NEW.gps_time,
      NEW.latitude,
      NEW.longitude,
      NEW.gps_time
    )
    ON CONFLICT (device_id)
    DO UPDATE SET
      geofence_id = current_geofence.geofence_id,
      is_inside = true,
      entered_at = NEW.gps_time,
      entry_latitude = NEW.latitude,
      entry_longitude = NEW.longitude,
      last_checked_at = NEW.gps_time,
      updated_at = now();

    -- Create proactive event for geofence entry
    INSERT INTO proactive_vehicle_events (
      device_id,
      event_type,
      severity,
      title,
      description,
      metadata,
      latitude,
      longitude
    ) VALUES (
      NEW.device_id,
      'geofence_enter'::event_type,
      'info'::event_severity,
      format('Entered %s', current_geofence.geofence_name),
      format('Vehicle entered geofence zone: %s (%s)', current_geofence.geofence_name, current_geofence.zone_type),
      jsonb_build_object(
        'geofence_id', current_geofence.geofence_id,
        'geofence_name', current_geofence.geofence_name,
        'zone_type', current_geofence.zone_type,
        'entry_time', NEW.gps_time
      ),
      NEW.latitude,
      NEW.longitude
    );

    RAISE NOTICE 'Vehicle % entered geofence %', NEW.device_id, current_geofence.geofence_name;

  -- CASE 2: Vehicle just exited a geofence
  ELSIF NOT current_geofence.inside_geofence
        AND previous_status IS NOT NULL
        AND previous_status.is_inside THEN

    -- Calculate duration inside
    entry_duration := EXTRACT(EPOCH FROM (NEW.gps_time - previous_status.entered_at))::INTEGER / 60;

    -- Log exit event
    INSERT INTO geofence_events (
      geofence_id,
      device_id,
      event_type,
      event_time,
      latitude,
      longitude,
      speed,
      duration_inside_minutes
    ) VALUES (
      previous_status.geofence_id,
      NEW.device_id,
      'exit',
      NEW.gps_time,
      NEW.latitude,
      NEW.longitude,
      NEW.speed,
      entry_duration
    );

    -- Get geofence name for the event
    DECLARE
      geofence_name TEXT;
      zone_type TEXT;
    BEGIN
      SELECT name, zone_type INTO geofence_name, zone_type
      FROM geofence_zones
      WHERE id = previous_status.geofence_id;

      -- Create proactive event for geofence exit
      INSERT INTO proactive_vehicle_events (
        device_id,
        event_type,
        severity,
        title,
        description,
        metadata,
        latitude,
        longitude
      ) VALUES (
        NEW.device_id,
        'geofence_exit'::event_type,
        'info'::event_severity,
        format('Exited %s', geofence_name),
        format('Vehicle exited geofence zone: %s after %s minutes', geofence_name, entry_duration),
        jsonb_build_object(
          'geofence_id', previous_status.geofence_id,
          'geofence_name', geofence_name,
          'zone_type', zone_type,
          'exit_time', NEW.gps_time,
          'duration_minutes', entry_duration
        ),
        NEW.latitude,
        NEW.longitude
      );

      RAISE NOTICE 'Vehicle % exited geofence % (duration: %min)', NEW.device_id, geofence_name, entry_duration;
    END;

    -- Update status
    UPDATE vehicle_geofence_status
    SET
      geofence_id = NULL,
      is_inside = false,
      last_checked_at = NEW.gps_time,
      updated_at = now()
    WHERE device_id = NEW.device_id;

  -- CASE 3: Still inside/outside, just update timestamp
  ELSIF previous_status IS NOT NULL THEN
    UPDATE vehicle_geofence_status
    SET
      last_checked_at = NEW.gps_time,
      updated_at = now()
    WHERE device_id = NEW.device_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on position_history
CREATE TRIGGER detect_geofence_crossings_trigger
AFTER INSERT ON position_history
FOR EACH ROW
EXECUTE FUNCTION detect_geofence_crossings();

-- Function to manually check geofence status for all vehicles
CREATE OR REPLACE FUNCTION check_all_vehicle_geofences()
RETURNS TABLE (
  device_id TEXT,
  inside_geofence BOOLEAN,
  geofence_name TEXT,
  events_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  vehicle_record RECORD;
  events_count INTEGER := 0;
BEGIN
  FOR vehicle_record IN
    SELECT DISTINCT vp.device_id, vp.latitude, vp.longitude
    FROM vehicle_positions vp
    WHERE vp.is_online = true
  LOOP
    -- This will trigger geofence detection via the check_geofence_status function
    -- Return results for monitoring
    RETURN QUERY
    SELECT
      vehicle_record.device_id,
      gf.inside_geofence,
      gf.geofence_name,
      0 AS events_created
    FROM check_geofence_status(
      vehicle_record.device_id,
      vehicle_record.latitude,
      vehicle_record.longitude
    ) gf;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION check_all_vehicle_geofences TO service_role;

-- Function to get current geofence context for a vehicle
CREATE OR REPLACE FUNCTION get_vehicle_geofence_context(
  p_device_id TEXT
)
RETURNS TABLE (
  is_inside_geofence BOOLEAN,
  geofence_id UUID,
  geofence_name TEXT,
  zone_type TEXT,
  entered_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  recent_events_count INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(vgs.is_inside, false) AS is_inside_geofence,
    vgs.geofence_id,
    gz.name AS geofence_name,
    gz.zone_type,
    vgs.entered_at,
    CASE
      WHEN vgs.entered_at IS NOT NULL THEN
        EXTRACT(EPOCH FROM (now() - vgs.entered_at))::INTEGER / 60
      ELSE NULL
    END AS duration_minutes,
    (
      SELECT COUNT(*)::INTEGER
      FROM geofence_events ge
      WHERE ge.device_id = p_device_id
        AND ge.event_time >= now() - INTERVAL '24 hours'
    ) AS recent_events_count
  FROM vehicle_geofence_status vgs
  LEFT JOIN geofence_zones gz ON vgs.geofence_id = gz.id
  WHERE vgs.device_id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_vehicle_geofence_context TO authenticated;

-- Function to get geofence statistics
CREATE OR REPLACE FUNCTION get_geofence_statistics(
  p_geofence_id UUID DEFAULT NULL,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  geofence_id UUID,
  geofence_name TEXT,
  total_entries INTEGER,
  total_exits INTEGER,
  unique_vehicles INTEGER,
  avg_duration_minutes DECIMAL,
  last_activity TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gz.id AS geofence_id,
    gz.name AS geofence_name,
    COUNT(*) FILTER (WHERE ge.event_type = 'entry')::INTEGER AS total_entries,
    COUNT(*) FILTER (WHERE ge.event_type = 'exit')::INTEGER AS total_exits,
    COUNT(DISTINCT ge.device_id)::INTEGER AS unique_vehicles,
    AVG(ge.duration_inside_minutes) AS avg_duration_minutes,
    MAX(ge.event_time) AS last_activity
  FROM geofence_zones gz
  LEFT JOIN geofence_events ge ON gz.id = ge.geofence_id
    AND ge.event_time >= now() - (p_days || ' days')::INTERVAL
  WHERE p_geofence_id IS NULL OR gz.id = p_geofence_id
  GROUP BY gz.id, gz.name
  ORDER BY total_entries DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_geofence_statistics TO authenticated;

-- Comments
COMMENT ON TABLE vehicle_geofence_status IS 'Tracks current geofence status for each vehicle';
COMMENT ON FUNCTION detect_geofence_crossings IS 'Automatically detects and logs geofence entry/exit events';
COMMENT ON FUNCTION check_all_vehicle_geofences IS 'Batch checks geofence status for all online vehicles';
COMMENT ON FUNCTION get_vehicle_geofence_context IS 'Returns current geofence context for AI integration';
COMMENT ON FUNCTION get_geofence_statistics IS 'Returns statistics about geofence usage and activity';
