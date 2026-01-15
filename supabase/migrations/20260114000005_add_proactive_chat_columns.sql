-- Add columns to vehicle_chat_history to support proactive messages
-- These columns allow us to track which messages were generated proactively by the AI

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
