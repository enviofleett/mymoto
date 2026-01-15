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
-- MIGRATION 3: Create Alarm-to-Chat Trigger (Webhook Version)
-- ============================================
-- NOTE: This uses Supabase Webhooks instead of net.http_post
-- After running this migration, set up a webhook in Supabase Dashboard
-- See WEBHOOK_SETUP_GUIDE.md for detailed instructions

-- Simple trigger function (webhook will handle the HTTP call)
CREATE OR REPLACE FUNCTION notify_alarm_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This trigger just fires - the actual HTTP call happens via Supabase webhook
  -- The webhook is configured in Dashboard > Database > Webhooks
  -- This ensures the trigger exists for the webhook to work properly
  
  RETURN NEW;
END;
$$;

-- Create trigger on proactive_vehicle_events INSERT
DROP TRIGGER IF EXISTS trigger_alarm_to_chat ON public.proactive_vehicle_events;
CREATE TRIGGER trigger_alarm_to_chat
AFTER INSERT ON public.proactive_vehicle_events
FOR EACH ROW
EXECUTE FUNCTION notify_alarm_to_chat();

COMMENT ON FUNCTION notify_alarm_to_chat IS 'Trigger function for alarm-to-chat. Actual HTTP call handled by Supabase webhook. See WEBHOOK_SETUP_GUIDE.md';
COMMENT ON TRIGGER trigger_alarm_to_chat ON public.proactive_vehicle_events IS 
'Triggers when new proactive event is created. Webhook calls proactive-alarm-to-chat edge function.';
