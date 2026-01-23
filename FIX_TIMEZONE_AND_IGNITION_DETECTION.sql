-- ============================================================================
-- FIX: Add Ignition Detection on vehicle_positions Updates
-- ============================================================================
-- Problem: Ignition events only detected on position_history inserts
-- Solution: Also detect ignition changes when vehicle_positions is updated
-- ============================================================================

-- Update detect_online_status_changes() to also detect ignition changes
CREATE OR REPLACE FUNCTION detect_online_status_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  use_function BOOLEAN := false;
BEGIN
  -- 1. DETECT VEHICLE GOING OFFLINE
  IF NEW.is_online = false AND (OLD.is_online IS NULL OR OLD.is_online = true) THEN
    -- Check if create_proactive_event function exists
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND p.proname = 'create_proactive_event'
    ) INTO use_function;
    
    IF use_function THEN
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
    ELSE
      INSERT INTO proactive_vehicle_events (
        device_id, event_type, severity, title, message, metadata
      ) VALUES (
        NEW.device_id,
        'offline',
        'warning',
        'Vehicle Offline',
        'Vehicle has lost GPS connection',
        jsonb_build_object(
          'last_seen', NEW.last_updated,
          'last_battery', NEW.battery_percent
        )
      );
    END IF;
  END IF;

  -- 2. DETECT VEHICLE COMING BACK ONLINE
  IF NEW.is_online = true AND (OLD.is_online IS NULL OR OLD.is_online = false) THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND p.proname = 'create_proactive_event'
    ) INTO use_function;
    
    IF use_function THEN
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
    ELSE
      INSERT INTO proactive_vehicle_events (
        device_id, event_type, severity, title, message, metadata
      ) VALUES (
        NEW.device_id,
        'online',
        'info',
        'Vehicle Online',
        'Vehicle has reconnected',
        jsonb_build_object(
          'battery_percent', NEW.battery_percent,
          'ignition_on', NEW.ignition_on
        )
      );
    END IF;
  END IF;

  -- 3. DETECT IGNITION ON (NEW - when vehicle_positions is updated)
  IF NEW.ignition_on = true AND (OLD.ignition_on IS NULL OR OLD.ignition_on = false) THEN
    -- Check cooldown (5 minutes) to prevent duplicate events
    DECLARE
      last_event_time TIMESTAMPTZ;
    BEGIN
      SELECT MAX(created_at) INTO last_event_time
      FROM proactive_vehicle_events
      WHERE device_id = NEW.device_id
        AND event_type = 'ignition_on'
        AND created_at > NOW() - INTERVAL '5 minutes';
      
      IF last_event_time IS NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public'
          AND p.proname = 'create_proactive_event'
        ) INTO use_function;
        
        IF use_function THEN
          PERFORM create_proactive_event(
            p_device_id := NEW.device_id,
            p_event_type := 'ignition_on'::event_type,
            p_severity := 'info'::event_severity,
            p_title := 'Vehicle Started',
            p_description := 'Ignition turned on, vehicle is now active',
            p_metadata := jsonb_build_object(
              'battery_percent', NEW.battery_percent,
              'location_lat', NEW.latitude,
              'location_lon', NEW.longitude,
              'detected_by', 'vehicle_positions_update'
            ),
            p_latitude := NEW.latitude,
            p_longitude := NEW.longitude,
            p_expires_hours := 2
          );
        ELSE
          INSERT INTO proactive_vehicle_events (
            device_id, event_type, severity, title, message, metadata
          ) VALUES (
            NEW.device_id,
            'ignition_on',
            'info',
            'Vehicle Started',
            'Ignition turned on, vehicle is now active',
            jsonb_build_object(
              'battery_percent', NEW.battery_percent,
              'location_lat', NEW.latitude,
              'location_lon', NEW.longitude,
              'detected_by', 'vehicle_positions_update'
            )
          );
        END IF;
      END IF;
    END;
  END IF;

  -- 4. DETECT IGNITION OFF (NEW - when vehicle_positions is updated)
  IF NEW.ignition_on = false AND OLD.ignition_on = true THEN
    -- Check cooldown (5 minutes) to prevent duplicate events
    DECLARE
      last_event_time TIMESTAMPTZ;
    BEGIN
      SELECT MAX(created_at) INTO last_event_time
      FROM proactive_vehicle_events
      WHERE device_id = NEW.device_id
        AND event_type = 'ignition_off'
        AND created_at > NOW() - INTERVAL '5 minutes';
      
      IF last_event_time IS NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public'
          AND p.proname = 'create_proactive_event'
        ) INTO use_function;
        
        IF use_function THEN
          PERFORM create_proactive_event(
            p_device_id := NEW.device_id,
            p_event_type := 'ignition_off'::event_type,
            p_severity := 'info'::event_severity,
            p_title := 'Engine Stopped',
            p_description := 'Vehicle engine has been turned off',
            p_metadata := jsonb_build_object(
              'location_lat', NEW.latitude,
              'location_lon', NEW.longitude,
              'final_battery', NEW.battery_percent,
              'detected_by', 'vehicle_positions_update'
            ),
            p_latitude := NEW.latitude,
            p_longitude := NEW.longitude,
            p_expires_hours := 2
          );
        ELSE
          INSERT INTO proactive_vehicle_events (
            device_id, event_type, severity, title, message, metadata
          ) VALUES (
            NEW.device_id,
            'ignition_off',
            'info',
            'Engine Stopped',
            'Vehicle engine has been turned off',
            jsonb_build_object(
              'location_lat', NEW.latitude,
              'location_lon', NEW.longitude,
              'final_battery', NEW.battery_percent,
              'detected_by', 'vehicle_positions_update'
            )
          );
        END IF;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Verify trigger exists and is enabled
-- The trigger should already exist from previous migration
-- If not, it will be created below
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'detect_status_changes_on_vehicle_positions'
    AND tgrelid = 'vehicle_positions'::regclass
  ) THEN
    CREATE TRIGGER detect_status_changes_on_vehicle_positions
    AFTER UPDATE ON vehicle_positions
    FOR EACH ROW
    EXECUTE FUNCTION detect_online_status_changes();
    
    RAISE NOTICE 'Created detect_status_changes_on_vehicle_positions trigger';
  ELSE
    RAISE NOTICE 'Trigger detect_status_changes_on_vehicle_positions already exists';
  END IF;
END $$;

-- Update comment
COMMENT ON FUNCTION detect_online_status_changes IS 'Detects when vehicles go online/offline AND ignition state changes. Creates events for both status and ignition changes.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check if function was updated
SELECT 
  proname,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%ignition_on%' AND pg_get_functiondef(oid) LIKE '%vehicle_positions_update%' 
    THEN '✅ Updated with ignition detection'
    ELSE '⚠️ May need update'
  END AS status
FROM pg_proc 
WHERE proname = 'detect_online_status_changes';

-- Check trigger exists
SELECT 
  tgname,
  tgrelid::regclass AS table_name,
  tgenabled AS enabled
FROM pg_trigger 
WHERE tgname = 'detect_status_changes_on_vehicle_positions';
