-- Final Diagnosis and Fix for Proactive Alarm-to-Chat
-- Since net.http_post might not be working, let's check and provide alternatives

-- ============================================
-- DIAGNOSIS: Check pg_net Extension
-- ============================================
SELECT 
  'EXTENSION CHECK' as check_type,
  extname as extension_name,
  extversion as version,
  CASE 
    WHEN extname = 'pg_net' THEN '✅ pg_net available - net.http_post should work'
    ELSE '❌ pg_net NOT found - net.http_post will fail!'
  END as status,
  CASE 
    WHEN extname = 'pg_net' THEN 'Try net.http_post approach'
    ELSE 'RECOMMEND: Use Supabase Database Webhooks instead'
  END as recommendation
FROM pg_extension
WHERE extname = 'pg_net';

-- ============================================
-- SOLUTION 1: Enable pg_net Extension (if available)
-- ============================================
-- If pg_net is not available, try enabling it:
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- SOLUTION 2: Use Webhook Instead (RECOMMENDED)
-- ============================================
-- If pg_net is not available or net.http_post is failing,
-- the best solution is to use Supabase Database Webhooks.

-- Step 1: Simplify the trigger function (just fires, no HTTP call)
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

COMMENT ON FUNCTION notify_alarm_to_chat IS 
'Trigger function for alarm-to-chat. Actual HTTP call handled by Supabase Database Webhook. See ALTERNATIVE_WEBHOOK_SETUP.md';

-- The trigger already exists, no need to recreate it

-- ============================================
-- SETUP WEBHOOK IN SUPABASE DASHBOARD
-- ============================================
-- After running this SQL, go to:
-- Supabase Dashboard → Database → Webhooks → Create New Webhook
--
-- Configuration:
-- - Name: proactive-alarm-to-chat-webhook
-- - Table: proactive_vehicle_events
-- - Events: INSERT (check box)
-- - Type: Edge Function
-- - Function: proactive-alarm-to-chat
-- - HTTP Method: POST
--
-- This webhook will automatically call the edge function when events are inserted.

-- ============================================
-- VERIFY SETUP
-- ============================================
-- Check trigger function
SELECT 
  'SETUP COMPLETE' as status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_alarm_to_chat') 
    THEN '✅ Trigger function exists'
    ELSE '❌ Trigger function missing'
  END as trigger_function;

-- Check trigger
SELECT 
  'TRIGGER CHECK' as status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_alarm_to_chat') 
    THEN '✅ Trigger exists'
    ELSE '❌ Trigger missing'
  END as trigger_status;

-- Webhook status
SELECT 
  'WEBHOOK STATUS' as status,
  '⏳ Webhook must be configured in Supabase Dashboard' as webhook_status;

-- ============================================
-- NEXT STEPS
-- ============================================
-- 1. ✅ Run this SQL to simplify trigger function
-- 2. ⏳ Set up webhook in Supabase Dashboard (see instructions above)
-- 3. ⏳ Test by creating a new event
-- 4. ⏳ Check webhook logs in Dashboard
-- 5. ⏳ Check edge function logs
