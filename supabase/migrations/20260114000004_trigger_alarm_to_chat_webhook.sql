-- Create trigger to automatically post alarms to chat via LLM
-- NOTE: This uses Supabase Webhooks (no net extension required)
-- After running this migration, set up a webhook in Supabase Dashboard

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

COMMENT ON FUNCTION notify_alarm_to_chat IS 'Trigger function for alarm-to-chat. Actual HTTP call handled by Supabase webhook.';
COMMENT ON TRIGGER trigger_alarm_to_chat ON public.proactive_vehicle_events IS 
'Triggers when new proactive event is created. Webhook calls proactive-alarm-to-chat edge function.';
