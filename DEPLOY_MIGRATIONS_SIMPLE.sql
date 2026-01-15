-- ============================================
-- MIGRATION 1: Fix RLS Policies for Alarms
-- ============================================
-- CRITICAL SECURITY FIX: Users should only see alarms for their assigned vehicles

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can read events" ON public.proactive_vehicle_events;
DROP POLICY IF EXISTS "Authenticated users can view events" ON public.proactive_vehicle_events;

-- Create new policy: Users can only see events for their assigned vehicles
CREATE POLICY "Users can view their vehicle events"
ON public.proactive_vehicle_events
FOR SELECT
USING (
  -- Admins can see all events
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Regular users can only see events for vehicles assigned to them
  EXISTS (
    SELECT 1
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = proactive_vehicle_events.device_id
      AND p.user_id = auth.uid()
  )
);

-- Users can acknowledge events for their vehicles
CREATE POLICY "Users can acknowledge their vehicle events"
ON public.proactive_vehicle_events
FOR UPDATE
USING (
  -- Admins can acknowledge any event
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Regular users can acknowledge events for their vehicles
  EXISTS (
    SELECT 1
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = proactive_vehicle_events.device_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  -- Same check for updates
  has_role(auth.uid(), 'admin'::app_role)
  OR
  EXISTS (
    SELECT 1
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = proactive_vehicle_events.device_id
      AND p.user_id = auth.uid()
  )
);

COMMENT ON POLICY "Users can view their vehicle events" ON public.proactive_vehicle_events IS 
'Users can only see proactive events for vehicles assigned to them. Admins can see all events.';

COMMENT ON POLICY "Users can acknowledge their vehicle events" ON public.proactive_vehicle_events IS 
'Users can acknowledge events for their assigned vehicles. Admins can acknowledge any event.';

-- ============================================
-- MIGRATION 2: Add Proactive Chat Columns
-- ============================================
-- Add columns to vehicle_chat_history to support proactive messages

-- Add is_proactive column to mark proactive messages
ALTER TABLE public.vehicle_chat_history 
ADD COLUMN IF NOT EXISTS is_proactive BOOLEAN DEFAULT false;

-- Add alert_id column to link proactive messages to their source event
ALTER TABLE public.vehicle_chat_history 
ADD COLUMN IF NOT EXISTS alert_id UUID REFERENCES public.proactive_vehicle_events(id) ON DELETE SET NULL;

-- Create index for efficient querying of proactive messages
CREATE INDEX IF NOT EXISTS idx_chat_history_proactive ON public.vehicle_chat_history(device_id, is_proactive, created_at DESC) WHERE is_proactive = true;

-- Create index for alert_id lookups
CREATE INDEX IF NOT EXISTS idx_chat_history_alert_id ON public.vehicle_chat_history(alert_id) WHERE alert_id IS NOT NULL;

COMMENT ON COLUMN public.vehicle_chat_history.is_proactive IS 'True if this message was generated proactively by the AI (e.g., from an alarm/event), false if it was a response to user input';
COMMENT ON COLUMN public.vehicle_chat_history.alert_id IS 'Reference to the proactive_vehicle_event that triggered this message, if applicable';

-- ============================================
-- MIGRATION 3: Create Alarm-to-Chat Trigger (SIMPLE VERSION)
-- ============================================
-- This version works with the basic table schema (id, device_id, event_type, severity, title, message, metadata, created_at)
-- If your table has additional columns (description, latitude, longitude, location_name, notified), 
-- you can modify the function to include them.

-- Function to call edge function when event is created
CREATE OR REPLACE FUNCTION notify_alarm_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get Supabase URL and service role key from app_settings
  SELECT value INTO supabase_url FROM app_settings WHERE key = 'supabase_url' LIMIT 1;
  SELECT value INTO service_role_key FROM app_settings WHERE key = 'supabase_service_role_key' LIMIT 1;

  -- Skip if settings not configured
  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'Supabase URL or service role key not configured in app_settings, skipping alarm-to-chat notification';
    RETURN NEW;
  END IF;

  -- Call edge function asynchronously (don't wait for response)
  -- This prevents blocking the event creation
  -- Using basic columns that exist in both table schemas
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/proactive-alarm-to-chat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'event', jsonb_build_object(
        'id', NEW.id,
        'device_id', NEW.device_id,
        'event_type', NEW.event_type,
        'severity', NEW.severity,
        'title', NEW.title,
        'message', COALESCE(NEW.message, NEW.title, ''),
        'metadata', COALESCE(NEW.metadata, '{}'::jsonb),
        'created_at', NEW.created_at
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the original operation if notification fails
  RAISE WARNING 'Failed to notify alarm-to-chat function: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create trigger on proactive_vehicle_events INSERT
DROP TRIGGER IF EXISTS trigger_alarm_to_chat ON public.proactive_vehicle_events;
CREATE TRIGGER trigger_alarm_to_chat
AFTER INSERT ON public.proactive_vehicle_events
FOR EACH ROW
EXECUTE FUNCTION notify_alarm_to_chat();

COMMENT ON FUNCTION notify_alarm_to_chat IS 'Automatically posts new proactive events to vehicle chat via LLM';
COMMENT ON TRIGGER trigger_alarm_to_chat ON public.proactive_vehicle_events IS 
'Triggers when new proactive event is created. Calls proactive-alarm-to-chat edge function to generate LLM message and post to chat.';
