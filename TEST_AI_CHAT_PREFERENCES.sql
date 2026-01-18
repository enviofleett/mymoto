-- Test AI Chat Preferences Implementation
-- Run this in Supabase SQL Editor to verify the implementation

-- STEP 1: Check if migration has been run (columns exist)
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

-- If the above returns 0 rows, you need to run the migration first!
-- Migration file: supabase/migrations/20260118103411_add_ai_chat_preferences.sql

-- STEP 2: Verify default values for critical events (only works after migration)
-- This will fail if migration hasn't been run - that's expected!
-- Uncomment after running migration:
/*
SELECT 
  enable_ai_chat_critical_battery,
  enable_ai_chat_offline,
  enable_ai_chat_maintenance_due,
  enable_ai_chat_anomaly_detected
FROM vehicle_notification_preferences
LIMIT 1;
*/

-- 3. Check if we can create/update preferences with AI chat columns
-- (This will create a test preference if you have a device_id and user_id)
-- Uncomment and modify device_id/user_id to test:
/*
INSERT INTO vehicle_notification_preferences (
  user_id,
  device_id,
  -- Push notification preferences
  ignition_on,
  overspeeding,
  -- AI Chat preferences (separate from push)
  enable_ai_chat_ignition_on,
  enable_ai_chat_overspeeding
) VALUES (
  'YOUR_USER_ID_HERE',
  'YOUR_DEVICE_ID_HERE',
  true,  -- Push notification enabled
  false, -- Push notification disabled
  false, -- AI Chat disabled
  true   -- AI Chat enabled (opposite of push)
)
ON CONFLICT (user_id, device_id) DO UPDATE SET
  ignition_on = EXCLUDED.ignition_on,
  overspeeding = EXCLUDED.overspeeding,
  enable_ai_chat_ignition_on = EXCLUDED.enable_ai_chat_ignition_on,
  enable_ai_chat_overspeeding = EXCLUDED.enable_ai_chat_overspeeding,
  updated_at = now()
RETURNING *;
*/

-- 4. Count vehicles with AI chat preferences (only works after migration)
-- Uncomment after running migration:
/*
SELECT 
  COUNT(DISTINCT device_id) as total_vehicles,
  COUNT(*) FILTER (WHERE enable_ai_chat_ignition_on = true) as ai_chat_ignition_on_enabled,
  COUNT(*) FILTER (WHERE enable_ai_chat_critical_battery = true) as ai_chat_critical_battery_enabled,
  COUNT(*) FILTER (WHERE enable_ai_chat_offline = true) as ai_chat_offline_enabled
FROM vehicle_notification_preferences;
*/

-- 5. Verify column types match expected boolean type
SELECT 
  COUNT(*) as invalid_types
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vehicle_notification_preferences'
  AND column_name LIKE 'enable_ai_chat_%'
  AND data_type != 'boolean';

-- Expected result: 0 (all should be boolean)
-- If columns don't exist yet, this will return 0 (which is correct - no invalid types if no columns)
