-- Verify AI Chat Preferences Migration Success
-- Run this after migration to confirm everything is working

-- 1. Check if all columns exist (should return 14 rows)
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vehicle_notification_preferences'
  AND column_name LIKE 'enable_ai_chat_%'
ORDER BY column_name;

-- Expected: 14 rows with column names like:
-- enable_ai_chat_anomaly_detected
-- enable_ai_chat_critical_battery
-- enable_ai_chat_geofence_enter
-- enable_ai_chat_geofence_exit
-- enable_ai_chat_harsh_braking
-- enable_ai_chat_idle_too_long
-- enable_ai_chat_ignition_off
-- enable_ai_chat_ignition_on
-- enable_ai_chat_low_battery
-- enable_ai_chat_maintenance_due
-- enable_ai_chat_offline
-- enable_ai_chat_online
-- enable_ai_chat_overspeeding
-- enable_ai_chat_rapid_acceleration
-- enable_ai_chat_trip_completed

-- 2. Verify default values (check critical events default to true)
SELECT 
  COUNT(*) as total_preferences,
  COUNT(*) FILTER (WHERE enable_ai_chat_critical_battery = true) as critical_battery_default,
  COUNT(*) FILTER (WHERE enable_ai_chat_offline = true) as offline_default,
  COUNT(*) FILTER (WHERE enable_ai_chat_maintenance_due = true) as maintenance_default,
  COUNT(*) FILTER (WHERE enable_ai_chat_anomaly_detected = true) as anomaly_default
FROM vehicle_notification_preferences;

-- 3. Test: Check if we can query a specific preference
SELECT 
  device_id,
  user_id,
  ignition_on as push_ignition_on,
  enable_ai_chat_ignition_on as ai_chat_ignition_on,
  critical_battery as push_critical_battery,
  enable_ai_chat_critical_battery as ai_chat_critical_battery
FROM vehicle_notification_preferences
LIMIT 5;

-- This should return rows showing both push and AI chat preferences side by side
