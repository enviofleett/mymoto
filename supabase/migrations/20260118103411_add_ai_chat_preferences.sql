-- Add Granular AI Chat Preferences
-- Allows users to separately control "AI Chat" vs "Push Notification" for events

-- Add AI Chat preference columns (separate from push/sound notifications)
ALTER TABLE public.vehicle_notification_preferences
  ADD COLUMN IF NOT EXISTS enable_ai_chat_ignition_on BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_ignition_off BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_low_battery BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_critical_battery BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_overspeeding BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_harsh_braking BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_rapid_acceleration BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_geofence_enter BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_geofence_exit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_idle_too_long BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_trip_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_offline BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_maintenance_due BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_anomaly_detected BOOLEAN DEFAULT true;

-- Migrate existing preferences as defaults for AI Chat (optional, for backward compatibility)
-- Users who already enabled push notifications will have AI chat enabled for critical events
DO $$
BEGIN
  -- For existing preferences where critical events are enabled, enable AI chat too
  UPDATE public.vehicle_notification_preferences
  SET
    enable_ai_chat_critical_battery = COALESCE(enable_ai_chat_critical_battery, critical_battery, true),
    enable_ai_chat_offline = COALESCE(enable_ai_chat_offline, offline, true),
    enable_ai_chat_maintenance_due = COALESCE(enable_ai_chat_maintenance_due, maintenance_due, true),
    enable_ai_chat_anomaly_detected = COALESCE(enable_ai_chat_anomaly_detected, anomaly_detected, true)
  WHERE 
    critical_battery = true 
    OR offline = true 
    OR maintenance_due = true 
    OR anomaly_detected = true;
END $$;

-- Comments
COMMENT ON COLUMN public.vehicle_notification_preferences.enable_ai_chat_ignition_on IS 'Enable AI chat messages when ignition turns on (separate from push notifications)';
COMMENT ON COLUMN public.vehicle_notification_preferences.enable_ai_chat_ignition_off IS 'Enable AI chat messages when ignition turns off (separate from push notifications)';
COMMENT ON COLUMN public.vehicle_notification_preferences.enable_ai_chat_low_battery IS 'Enable AI chat messages for low battery warnings (separate from push notifications)';
COMMENT ON COLUMN public.vehicle_notification_preferences.enable_ai_chat_critical_battery IS 'Enable AI chat messages for critical battery alerts (separate from push notifications)';
COMMENT ON COLUMN public.vehicle_notification_preferences.enable_ai_chat_overspeeding IS 'Enable AI chat messages for overspeeding alerts (separate from push notifications)';
COMMENT ON COLUMN public.vehicle_notification_preferences.enable_ai_chat_offline IS 'Enable AI chat messages when vehicle goes offline (separate from push notifications)';
