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
CREATE OR REPLACE FUNCTION public.get_vehicle_health(
    p_device_id TEXT
)
RETURNS TABLE (
    overall_health_score INTEGER,
    battery_health_score INTEGER,
    driving_behavior_score INTEGER,
    connectivity_score INTEGER,
    trend TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_battery_percent INTEGER;
    v_is_online BOOLEAN;
    v_battery_score INTEGER;
    v_connectivity_score INTEGER;
    v_driving_score INTEGER := 80; -- Default good score
    v_overall INTEGER;
    v_avg_speed DOUBLE PRECISION;
    v_overspeed_count INTEGER;
BEGIN
    -- Get current position data
    SELECT battery_percent, is_online
    INTO v_battery_percent, v_is_online
    FROM vehicle_positions
    WHERE device_id = p_device_id
    LIMIT 1;

    -- Calculate battery health score
    v_battery_score := CASE
        WHEN v_battery_percent IS NULL OR v_battery_percent <= 0 THEN 50
        WHEN v_battery_percent >= 80 THEN 100
        WHEN v_battery_percent >= 50 THEN 80
        WHEN v_battery_percent >= 20 THEN 60
        ELSE 40
    END;

    -- Calculate connectivity score
    v_connectivity_score := CASE
        WHEN v_is_online = true THEN 100
        ELSE 30
    END;

    -- Calculate driving behavior score based on recent history
    SELECT AVG(speed), COUNT(*) FILTER (WHERE speed > 100)
    INTO v_avg_speed, v_overspeed_count
    FROM position_history
    WHERE device_id = p_device_id
      AND gps_time > NOW() - INTERVAL '24 hours';

    IF v_overspeed_count > 5 THEN
        v_driving_score := 50;
    ELSIF v_overspeed_count > 2 THEN
        v_driving_score := 70;
    ELSE
        v_driving_score := 90;
    END IF;

    -- Calculate overall score (weighted average)
    v_overall := (v_battery_score * 30 + v_connectivity_score * 30 + v_driving_score * 40) / 100;

    RETURN QUERY SELECT
        v_overall AS overall_health_score,
        v_battery_score AS battery_health_score,
        v_driving_score AS driving_behavior_score,
        v_connectivity_score AS connectivity_score,
        CASE
            WHEN v_overall >= 80 THEN 'stable'
            WHEN v_overall >= 60 THEN 'declining'
            ELSE 'critical'
        END AS trend;
END;
$$;

-- get_maintenance_recommendations - Returns active maintenance recommendations
CREATE OR REPLACE FUNCTION public.get_maintenance_recommendations(
    p_device_id TEXT,
    p_status TEXT DEFAULT 'active'
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    priority TEXT,
    predicted_issue TEXT,
    status TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_battery_percent INTEGER;
    v_is_online BOOLEAN;
    v_last_update TIMESTAMPTZ;
BEGIN
    -- Get current vehicle status
    SELECT battery_percent, is_online, gps_time
    INTO v_battery_percent, v_is_online, v_last_update
    FROM vehicle_positions
    WHERE device_id = p_device_id
    LIMIT 1;

    -- Generate dynamic recommendations based on current state
    -- Low battery recommendation
    IF v_battery_percent IS NOT NULL AND v_battery_percent > 0 AND v_battery_percent < 30 THEN
        RETURN QUERY SELECT
            gen_random_uuid() AS id,
            'Charge Vehicle Battery'::TEXT AS title,
            ('Battery is at ' || v_battery_percent || '%. Recommend charging soon.')::TEXT AS description,
            CASE WHEN v_battery_percent < 15 THEN 'high' ELSE 'medium' END::TEXT AS priority,
            'Battery depletion'::TEXT AS predicted_issue,
            'active'::TEXT AS status,
            NOW() AS created_at;
    END IF;

    -- Offline recommendation
    IF v_is_online = false AND v_last_update IS NOT NULL AND v_last_update < NOW() - INTERVAL '1 hour' THEN
        RETURN QUERY SELECT
            gen_random_uuid() AS id,
            'Check GPS Device Connection'::TEXT AS title,
            'Vehicle has been offline for extended period. Check device connectivity.'::TEXT AS description,
            'medium'::TEXT AS priority,
            'GPS connectivity issue'::TEXT AS predicted_issue,
            'active'::TEXT AS status,
            NOW() AS created_at;
    END IF;

    -- Return empty if no issues
    RETURN;
END;
$$;

-- get_vehicle_geofence_context - Already may exist, create if not
CREATE OR REPLACE FUNCTION public.get_vehicle_geofence_context(
    p_device_id TEXT
)
RETURNS TABLE (
    is_inside_geofence BOOLEAN,
    geofence_name TEXT,
    zone_type TEXT,
    duration_minutes INTEGER,
    recent_events_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Placeholder - returns no geofence context for now
    -- Can be enhanced when geofence tables are created
    RETURN QUERY SELECT
        false::boolean AS is_inside_geofence,
        NULL::text AS geofence_name,
        NULL::text AS zone_type,
        0::integer AS duration_minutes,
        0::integer AS recent_events_count
    WHERE false; -- Returns empty set
END;
$$;