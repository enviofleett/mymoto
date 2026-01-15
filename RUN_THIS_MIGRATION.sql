-- Vehicle-Specific Notification Preferences
-- Allows users to enable/disable specific proactive notifications per vehicle

CREATE TABLE IF NOT EXISTS public.vehicle_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES vehicles(device_id) ON DELETE CASCADE,
  
  -- Event type toggles (default: false - user must opt-in)
  low_battery BOOLEAN DEFAULT false,
  critical_battery BOOLEAN DEFAULT true,  -- Critical events enabled by default
  overspeeding BOOLEAN DEFAULT false,
  harsh_braking BOOLEAN DEFAULT false,
  rapid_acceleration BOOLEAN DEFAULT false,
  ignition_on BOOLEAN DEFAULT false,
  ignition_off BOOLEAN DEFAULT false,
  geofence_enter BOOLEAN DEFAULT false,
  geofence_exit BOOLEAN DEFAULT false,
  idle_too_long BOOLEAN DEFAULT false,
  offline BOOLEAN DEFAULT true,  -- Offline alerts enabled by default
  online BOOLEAN DEFAULT false,
  maintenance_due BOOLEAN DEFAULT true,  -- Maintenance alerts enabled by default
  trip_completed BOOLEAN DEFAULT false,
  anomaly_detected BOOLEAN DEFAULT true,  -- Anomaly alerts enabled by default
  
  -- Special proactive features
  morning_greeting BOOLEAN DEFAULT false,  -- Morning briefing from AI
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id, device_id)
);

-- Enable RLS
ALTER TABLE public.vehicle_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can manage their own vehicle notification preferences" ON public.vehicle_notification_preferences;
DROP POLICY IF EXISTS "Service role can read all vehicle notification preferences" ON public.vehicle_notification_preferences;

-- Users can view and update their own preferences
CREATE POLICY "Users can manage their own vehicle notification preferences"
ON public.vehicle_notification_preferences
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Service role can read all preferences (for edge functions)
CREATE POLICY "Service role can read all vehicle notification preferences"
ON public.vehicle_notification_preferences
FOR SELECT
USING (true);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_vehicle_notification_preferences_user_device 
ON public.vehicle_notification_preferences(user_id, device_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_notification_preferences_device 
ON public.vehicle_notification_preferences(device_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_vehicle_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS update_vehicle_notification_preferences_updated_at ON public.vehicle_notification_preferences;

CREATE TRIGGER update_vehicle_notification_preferences_updated_at
BEFORE UPDATE ON public.vehicle_notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_vehicle_notification_preferences_updated_at();

COMMENT ON TABLE public.vehicle_notification_preferences IS 'Stores user preferences for which proactive notifications to receive for specific vehicles';
