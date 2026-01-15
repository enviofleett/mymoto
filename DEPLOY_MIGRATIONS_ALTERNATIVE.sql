-- ============================================
-- ALTERNATIVE: If net extension is not available
-- Use this instead of Migration 3 in DEPLOY_MIGRATIONS.sql
-- ============================================
-- This creates a simpler trigger that just marks events for processing
-- You'll need to set up a Supabase Edge Function webhook or cron job
-- to process these events

-- Create a function that just logs the event (for manual processing)
CREATE OR REPLACE FUNCTION log_alarm_for_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Just ensure the event is marked as needing notification
  -- The edge function can be called via webhook or cron job
  -- For now, we'll rely on the edge function being called manually
  -- or via Supabase webhooks configured in the dashboard
  
  RETURN NEW;
END;
$$;

-- Create trigger (this is a placeholder - actual processing happens via webhook)
CREATE TRIGGER trigger_alarm_to_chat
AFTER INSERT ON public.proactive_vehicle_events
FOR EACH ROW
WHEN (NEW.notified IS NULL OR NEW.notified = false)
EXECUTE FUNCTION log_alarm_for_chat();

COMMENT ON FUNCTION log_alarm_for_chat IS 'Placeholder function for alarm-to-chat processing. Use Supabase webhooks to call proactive-alarm-to-chat edge function.';

-- ============================================
-- SETUP INSTRUCTIONS:
-- ============================================
-- 1. Deploy the proactive-alarm-to-chat edge function
-- 2. In Supabase Dashboard, go to Database > Webhooks
-- 3. Create a new webhook:
--    - Table: proactive_vehicle_events
--    - Events: INSERT
--    - URL: https://YOUR_PROJECT.supabase.co/functions/v1/proactive-alarm-to-chat
--    - HTTP Method: POST
--    - Headers: 
--      - Authorization: Bearer YOUR_SERVICE_ROLE_KEY
--      - Content-Type: application/json
--    - Payload: 
--      {
--        "event": {
--          "id": "{{ $new.id }}",
--          "device_id": "{{ $new.device_id }}",
--          "event_type": "{{ $new.event_type }}",
--          "severity": "{{ $new.severity }}",
--          "title": "{{ $new.title }}",
--          "message": "{{ $new.message }}",
--          "description": "{{ $new.description }}",
--          "metadata": {{ $new.metadata }},
--          "latitude": {{ $new.latitude }},
--          "longitude": {{ $new.longitude }},
--          "location_name": "{{ $new.location_name }}",
--          "created_at": "{{ $new.created_at }}"
--        }
--      }
