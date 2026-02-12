-- =====================================================
-- Phase 1: Critical Fixes Migration
-- 1. vehicle_command_logs table
-- 2. Proactive alert triggers (low battery, overspeeding)
-- 3. Missing RPC functions
-- =====================================================

-- =====================================================
-- TASK 1: vehicle_command_logs table
-- =====================================================
CREATE TABLE public.vehicle_command_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    command_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, executing, success, failed
    result JSONB DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    requires_confirmation BOOLEAN DEFAULT false,
    confirmed_at TIMESTAMPTZ DEFAULT NULL,
    confirmed_by UUID DEFAULT NULL,
    executed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.vehicle_command_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read command logs"
ON public.vehicle_command_logs FOR SELECT
USING (true);

CREATE POLICY "Users can create command logs"
ON public.vehicle_command_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage command logs"
ON public.vehicle_command_logs FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage command logs"
ON public.vehicle_command_logs FOR ALL
USING (true)
WITH CHECK (true);

-- Index for faster lookups
CREATE INDEX idx_command_logs_device_id ON public.vehicle_command_logs(device_id);
CREATE INDEX idx_command_logs_status ON public.vehicle_command_logs(status);
CREATE INDEX idx_command_logs_created_at ON public.vehicle_command_logs(created_at DESC);

-- =====================================================
-- TASK 2: Proactive Alert Triggers
-- =====================================================

-- Add previous_battery column for tracking state changes
ALTER TABLE public.vehicle_positions 
ADD COLUMN IF NOT EXISTS previous_battery_percent INTEGER DEFAULT NULL;

-- Enable realtime on proactive_vehicle_events for frontend subscription
ALTER TABLE public.proactive_vehicle_events REPLICA IDENTITY FULL;

-- Function to detect critical events on position updates
CREATE OR REPLACE FUNCTION public.detect_critical_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    event_key TEXT;
    last_event_time TIMESTAMPTZ;
    cooldown_minutes INTEGER := 5; -- Prevent duplicate events within 5 minutes
BEGIN
    -- LOW BATTERY DETECTION (only on state change or first detection)
    IF NEW.battery_percent IS NOT NULL AND NEW.battery_percent > 0 AND NEW.battery_percent < 20 THEN
        -- Check if we already have a recent low battery event
        event_key := CASE WHEN NEW.battery_percent < 10 THEN 'critical_battery' ELSE 'low_battery' END;
        
        SELECT MAX(created_at) INTO last_event_time
        FROM proactive_vehicle_events
        WHERE device_id = NEW.device_id
          AND event_type = event_key
          AND created_at > NOW() - INTERVAL '5 minutes';
        
        -- Only create if no recent event exists
        IF last_event_time IS NULL THEN
            -- Also check for state change (was >= 20, now < 20)
            IF OLD.battery_percent IS NULL OR OLD.battery_percent >= 20 OR NEW.battery_percent < OLD.battery_percent THEN
                INSERT INTO proactive_vehicle_events (
                    device_id, event_type, severity, title, message, metadata
                ) VALUES (
                    NEW.device_id,
                    event_key,
                    CASE WHEN NEW.battery_percent < 10 THEN 'critical' ELSE 'warning' END,
                    CASE WHEN NEW.battery_percent < 10 THEN 'Critical Battery Alert' ELSE 'Low Battery Alert' END,
                    'Battery at ' || NEW.battery_percent || '%',
                    jsonb_build_object('battery_percent', NEW.battery_percent, 'previous_percent', OLD.battery_percent)
                );
            END IF;
        END IF;
    END IF;

    -- OVERSPEEDING DETECTION
    IF NEW.is_overspeeding = true AND NEW.speed IS NOT NULL AND NEW.speed > 0 AND NEW.speed < 300 THEN
        -- Check cooldown
        SELECT MAX(created_at) INTO last_event_time
        FROM proactive_vehicle_events
        WHERE device_id = NEW.device_id
          AND event_type = 'overspeeding'
          AND created_at > NOW() - INTERVAL '5 minutes';
        
        IF last_event_time IS NULL THEN
            INSERT INTO proactive_vehicle_events (
                device_id, event_type, severity, title, message, metadata
            ) VALUES (
                NEW.device_id,
                'overspeeding',
                CASE WHEN NEW.speed > 120 THEN 'error' ELSE 'warning' END,
                'Overspeeding Detected',
                'Vehicle traveling at ' || ROUND(NEW.speed::numeric, 0) || ' km/h',
                jsonb_build_object('speed', NEW.speed, 'threshold', 100)
            );
        END IF;
    END IF;

    -- Store previous battery for next comparison
    NEW.previous_battery_percent := OLD.battery_percent;
    
    RETURN NEW;
END;
$$;

-- Create trigger on vehicle_positions
DROP TRIGGER IF EXISTS trigger_detect_critical_events ON vehicle_positions;
CREATE TRIGGER trigger_detect_critical_events
BEFORE UPDATE ON vehicle_positions
FOR EACH ROW
EXECUTE FUNCTION detect_critical_events();

-- Also trigger on INSERT for new vehicles
CREATE OR REPLACE FUNCTION public.detect_critical_events_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- LOW BATTERY on initial insert
    IF NEW.battery_percent IS NOT NULL AND NEW.battery_percent > 0 AND NEW.battery_percent < 20 THEN
        INSERT INTO proactive_vehicle_events (
            device_id, event_type, severity, title, message, metadata
        ) VALUES (
            NEW.device_id,
            CASE WHEN NEW.battery_percent < 10 THEN 'critical_battery' ELSE 'low_battery' END,
            CASE WHEN NEW.battery_percent < 10 THEN 'critical' ELSE 'warning' END,
            CASE WHEN NEW.battery_percent < 10 THEN 'Critical Battery Alert' ELSE 'Low Battery Alert' END,
            'Battery at ' || NEW.battery_percent || '%',
            jsonb_build_object('battery_percent', NEW.battery_percent)
        );
    END IF;

    -- OVERSPEEDING on initial insert
    IF NEW.is_overspeeding = true AND NEW.speed IS NOT NULL AND NEW.speed > 0 THEN
        INSERT INTO proactive_vehicle_events (
            device_id, event_type, severity, title, message, metadata
        ) VALUES (
            NEW.device_id,
            'overspeeding',
            CASE WHEN NEW.speed > 120 THEN 'error' ELSE 'warning' END,
            'Overspeeding Detected',
            'Vehicle traveling at ' || ROUND(NEW.speed::numeric, 0) || ' km/h',
            jsonb_build_object('speed', NEW.speed)
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_detect_critical_events_insert ON vehicle_positions;
CREATE TRIGGER trigger_detect_critical_events_insert
AFTER INSERT ON vehicle_positions
FOR EACH ROW
EXECUTE FUNCTION detect_critical_events_insert();

-- =====================================================
-- TASK 3: Missing RPC Functions
-- =====================================================

-- get_current_location_context - Returns learned location context
CREATE OR REPLACE FUNCTION public.get_current_location_context(
    p_device_id TEXT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION
)
RETURNS TABLE (
    at_learned_location BOOLEAN,
    location_name TEXT,
    custom_label TEXT,
    location_type TEXT,
    visit_count INTEGER,
    last_visit_days_ago INTEGER,
    typical_duration_minutes INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- For now, return empty result (no learned locations table yet)
    -- This can be enhanced when learned_locations table is created
    RETURN QUERY SELECT 
        false::boolean AS at_learned_location,
        NULL::text AS location_name,
        NULL::text AS custom_label,
        NULL::text AS location_type,
        0::integer AS visit_count,
        0::integer AS last_visit_days_ago,
        0::integer AS typical_duration_minutes
    WHERE false; -- Returns empty set
END;
$$;

-- get_vehicle_health - Returns health metrics for a vehicle
DROP FUNCTION IF EXISTS public.get_vehicle_health(TEXT);
CREATE OR REPLACE FUNCTION public.get_vehicle_health(
    p_device_id TEXT
)
RETURNS TABLE (
    overall_health_score INTEGER,
    battery_health_score INTEGER,
    driving_behavior_score INTEGER,
    connectivity_score INTEGER,
    trend TEXT,
    score_change INTEGER,
    measured_at TIMESTAMP WITH TIME ZONE,
    active_recommendations INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        vhm.overall_health_score,
        vhm.battery_health_score,
        vhm.driving_behavior_score,
        vhm.connectivity_score,
        vhm.trend,
        vhm.score_change,
        vhm.measured_at,
        (SELECT COUNT(*)::INTEGER
         FROM maintenance_recommendations mr
         WHERE mr.device_id = p_device_id
           AND mr.status = 'active') AS active_recommendations
    FROM vehicle_health_metrics vhm
    WHERE vhm.device_id = p_device_id
    ORDER BY vhm.measured_at DESC
    LIMIT 1;
END;
$$;

-- get_maintenance_recommendations - Returns active maintenance recommendations
DROP FUNCTION IF EXISTS public.get_maintenance_recommendations(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.get_maintenance_recommendations(
    p_device_id TEXT,
    p_status TEXT DEFAULT 'active'
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    recommendation_type TEXT,
    priority maintenance_priority,
    predicted_issue TEXT,
    confidence_score DECIMAL,
    estimated_days_until_failure INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    days_since_created INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        mr.id,
        mr.title,
        mr.description,
        mr.recommendation_type,
        mr.priority,
        mr.predicted_issue,
        mr.confidence_score,
        mr.estimated_days_until_failure,
        mr.created_at,
        EXTRACT(DAYS FROM (now() - mr.created_at))::INTEGER AS days_since_created
    FROM maintenance_recommendations mr
    WHERE mr.device_id = p_device_id
      AND mr.status = p_status
    ORDER BY
        CASE mr.priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
        END,
        mr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_recommendations TO authenticated;

-- get_vehicle_geofence_context - Already may exist, create if not
DROP FUNCTION IF EXISTS public.get_vehicle_geofence_context(TEXT);
CREATE OR REPLACE FUNCTION public.get_vehicle_geofence_context(
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
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.get_vehicle_geofence_context TO authenticated;
