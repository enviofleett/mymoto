-- Proactive Vehicle Events System
-- Detects and stores significant vehicle events for proactive AI notifications

-- Event types enum
CREATE TYPE event_type AS ENUM (
  'low_battery',
  'critical_battery',
  'overspeeding',
  'harsh_braking',
  'rapid_acceleration',
  'ignition_on',
  'ignition_off',
  'geofence_enter',
  'geofence_exit',
  'idle_too_long',
  'offline',
  'online',
  'maintenance_due',
  'trip_completed',
  'anomaly_detected'
);

-- Event severity levels
CREATE TYPE event_severity AS ENUM (
  'info',
  'warning',
  'error',
  'critical'
);

-- Proactive vehicle events table
CREATE TABLE public.proactive_vehicle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  event_type event_type NOT NULL,
  severity event_severity NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Event context
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_name TEXT,

  -- Event data
  value_before DECIMAL,
  value_after DECIMAL,
  threshold DECIMAL,

  -- Status tracking
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID REFERENCES auth.users(id),

  -- Notification tracking
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Indexes
  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_proactive_events_device_time ON proactive_vehicle_events(device_id, created_at DESC);
CREATE INDEX idx_proactive_events_type ON proactive_vehicle_events(event_type, created_at DESC);
CREATE INDEX idx_proactive_events_severity ON proactive_vehicle_events(severity, created_at DESC);
CREATE INDEX idx_proactive_events_unacknowledged ON proactive_vehicle_events(acknowledged, created_at DESC) WHERE acknowledged = false;

-- Enable RLS
ALTER TABLE public.proactive_vehicle_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view events"
ON public.proactive_vehicle_events FOR SELECT
USING (true);

CREATE POLICY "Admins can manage events"
ON public.proactive_vehicle_events FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Function to create a proactive event
CREATE OR REPLACE FUNCTION create_proactive_event(
  p_device_id TEXT,
  p_event_type event_type,
  p_severity event_severity,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_latitude DECIMAL DEFAULT NULL,
  p_longitude DECIMAL DEFAULT NULL,
  p_value_before DECIMAL DEFAULT NULL,
  p_value_after DECIMAL DEFAULT NULL,
  p_threshold DECIMAL DEFAULT NULL,
  p_expires_hours INTEGER DEFAULT 24
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_id UUID;
  location_name_var TEXT;
BEGIN
  -- Reverse geocode if coordinates provided (placeholder - would need external API)
  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    location_name_var := p_latitude::TEXT || ', ' || p_longitude::TEXT;
  END IF;

  -- Insert event
  INSERT INTO public.proactive_vehicle_events (
    device_id,
    event_type,
    severity,
    title,
    description,
    metadata,
    latitude,
    longitude,
    location_name,
    value_before,
    value_after,
    threshold,
    expires_at
  ) VALUES (
    p_device_id,
    p_event_type,
    p_severity,
    p_title,
    p_description,
    p_metadata,
    p_latitude,
    p_longitude,
    location_name_var,
    p_value_before,
    p_value_after,
    p_threshold,
    now() + (p_expires_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_proactive_event TO authenticated, service_role;

-- Function to get recent unacknowledged events
CREATE OR REPLACE FUNCTION get_unacknowledged_events(
  p_device_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  event_type event_type,
  severity event_severity,
  title TEXT,
  description TEXT,
  metadata JSONB,
  latitude DECIMAL,
  longitude DECIMAL,
  location_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  age_minutes INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.device_id,
    e.event_type,
    e.severity,
    e.title,
    e.description,
    e.metadata,
    e.latitude,
    e.longitude,
    e.location_name,
    e.created_at,
    EXTRACT(EPOCH FROM (now() - e.created_at))::INTEGER / 60 AS age_minutes
  FROM proactive_vehicle_events e
  WHERE
    e.acknowledged = false
    AND (p_device_id IS NULL OR e.device_id = p_device_id)
    AND (e.expires_at IS NULL OR e.expires_at > now())
  ORDER BY e.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_unacknowledged_events TO authenticated;

-- Function to acknowledge an event
CREATE OR REPLACE FUNCTION acknowledge_event(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE proactive_vehicle_events
  SET
    acknowledged = true,
    acknowledged_at = now(),
    acknowledged_by = p_user_id
  WHERE id = p_event_id
    AND acknowledged = false;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION acknowledge_event TO authenticated;

-- Function to clean up old/expired events
CREATE OR REPLACE FUNCTION cleanup_expired_events()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  -- Delete events that are:
  -- 1. Expired and acknowledged
  -- 2. Older than 30 days and acknowledged
  -- 3. Older than 7 days and severity is 'info'

  WITH deleted AS (
    DELETE FROM proactive_vehicle_events
    WHERE
      (expires_at IS NOT NULL AND expires_at < now() AND acknowledged = true)
      OR (created_at < now() - INTERVAL '30 days' AND acknowledged = true)
      OR (created_at < now() - INTERVAL '7 days' AND severity = 'info')
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_expired_events TO service_role;

-- Function to get event statistics
CREATE OR REPLACE FUNCTION get_event_statistics(
  p_device_id TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  event_type event_type,
  severity event_severity,
  event_count BIGINT,
  acknowledged_count BIGINT,
  last_occurrence TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.event_type,
    e.severity,
    COUNT(*) AS event_count,
    COUNT(*) FILTER (WHERE e.acknowledged = true) AS acknowledged_count,
    MAX(e.created_at) AS last_occurrence
  FROM proactive_vehicle_events e
  WHERE
    (p_device_id IS NULL OR e.device_id = p_device_id)
    AND e.created_at >= now() - (p_days || ' days')::INTERVAL
  GROUP BY e.event_type, e.severity
  ORDER BY event_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_event_statistics TO authenticated;

-- Trigger function to prevent duplicate events within a time window
CREATE OR REPLACE FUNCTION prevent_duplicate_events()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  recent_event_count INTEGER;
BEGIN
  -- Check for same event type within last 5 minutes
  SELECT COUNT(*) INTO recent_event_count
  FROM proactive_vehicle_events
  WHERE
    device_id = NEW.device_id
    AND event_type = NEW.event_type
    AND created_at > now() - INTERVAL '5 minutes';

  -- If duplicate found, skip insertion
  IF recent_event_count > 0 THEN
    RAISE NOTICE 'Duplicate event prevented: % for device %', NEW.event_type, NEW.device_id;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to prevent duplicate events
CREATE TRIGGER prevent_duplicate_events_trigger
BEFORE INSERT ON proactive_vehicle_events
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_events();

-- Comments
COMMENT ON TABLE proactive_vehicle_events IS 'Stores proactive events detected from vehicle telemetry for AI-driven notifications and insights';
COMMENT ON FUNCTION create_proactive_event IS 'Creates a new proactive event with metadata. Used by triggers and external systems.';
COMMENT ON FUNCTION get_unacknowledged_events IS 'Returns unacknowledged events for a device or all devices';
COMMENT ON FUNCTION acknowledge_event IS 'Marks an event as acknowledged by a user';
COMMENT ON FUNCTION cleanup_expired_events IS 'Removes old and expired events. Should be run daily via cron.';
COMMENT ON FUNCTION get_event_statistics IS 'Returns aggregated statistics about events for monitoring and analytics';
