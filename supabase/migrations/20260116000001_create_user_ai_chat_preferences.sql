-- Create table to store user AI chat preferences
-- This allows edge functions to check if a user wants AI conversations for specific events

CREATE TABLE IF NOT EXISTS public.user_ai_chat_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ignition_start BOOLEAN DEFAULT false,
  geofence_event BOOLEAN DEFAULT false,
  overspeeding BOOLEAN DEFAULT false,
  low_battery BOOLEAN DEFAULT false,
  power_off BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_ai_chat_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can manage their own AI chat preferences" ON public.user_ai_chat_preferences;
DROP POLICY IF EXISTS "Service role can read all AI chat preferences" ON public.user_ai_chat_preferences;

-- Users can view and update their own preferences
CREATE POLICY "Users can manage their own AI chat preferences"
ON public.user_ai_chat_preferences
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Service role can read all preferences (for edge functions)
CREATE POLICY "Service role can read all AI chat preferences"
ON public.user_ai_chat_preferences
FOR SELECT
USING (true);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_ai_chat_preferences_user_id 
ON public.user_ai_chat_preferences(user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_ai_chat_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS update_user_ai_chat_preferences_updated_at ON public.user_ai_chat_preferences;

CREATE TRIGGER update_user_ai_chat_preferences_updated_at
BEFORE UPDATE ON public.user_ai_chat_preferences
FOR EACH ROW
EXECUTE FUNCTION update_user_ai_chat_preferences_updated_at();

COMMENT ON TABLE public.user_ai_chat_preferences IS 'Stores user preferences for which events should trigger AI conversations';
