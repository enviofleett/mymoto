# Deploy Ignition Detection Fix

## ✅ Current Status

**Trigger Status:**
- ✅ Trigger `detect_status_changes_on_vehicle_positions` exists
- ✅ Trigger is enabled (`"O"` = enabled)
- ⚠️ Function needs update to add ignition detection

## 🚀 Deployment Steps

### Step 1: Deploy the Updated Function

Copy and run the SQL from `FIX_TIMEZONE_AND_IGNITION_DETECTION.sql` in Supabase SQL Editor.

**Or run this directly:**

```sql
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

-- Update comment
COMMENT ON FUNCTION detect_online_status_changes IS 'Detects when vehicles go online/offline AND ignition state changes. Creates events for both status and ignition changes.';
```

### Step 2: Verify the Update

Run this query to confirm the function includes ignition detection:

```sql
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
```

**Expected Result:**
```
proname                          | status
---------------------------------|----------------------------------
detect_online_status_changes     | ✅ Updated with ignition detection
```

## 🧪 Testing

After deployment, monitor for ignition events:

```sql
-- Check for new ignition events (last hour)
SELECT 
  event_type,
  COUNT(*) as count,
  MAX(created_at) as latest_event
FROM proactive_vehicle_events
WHERE event_type IN ('ignition_on', 'ignition_off')
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;
```

**What to Expect:**
- Events will appear when vehicles start (ignition_on: false → true)
- Events will appear when vehicles stop (ignition_on: true → false)
- Events have 5-minute cooldown to prevent duplicates
- Events include `detected_by: 'vehicle_positions_update'` in metadata

## 📊 Current Status

- ✅ Trigger exists and is enabled
- ⏳ Function update pending (run Step 1)
- ⏳ Testing pending (after deployment)

---

**Next:** Run the SQL from Step 1 in Supabase SQL Editor to complete the deployment.
