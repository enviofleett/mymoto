# Alternative: Use Supabase Database Webhooks
**Why:** If `net.http_post` isn't working, use Supabase's built-in webhook system

---

## Problem

The trigger uses `net.http_post` which requires:
- `pg_net` extension enabled
- Network connectivity from database to edge functions
- Correct URL and service role key

If any of these fail, the trigger silently skips calling the edge function.

---

## Solution: Supabase Database Webhooks

Instead of using `net.http_post` in the trigger, use Supabase's Database Webhook system which is more reliable.

### Step 1: Update Trigger Function

The trigger function should just fire - the webhook handles the HTTP call:

```sql
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
```

### Step 2: Set Up Webhook in Supabase Dashboard

1. Go to: **Supabase Dashboard** → **Database** → **Webhooks**
2. Click **"Create a new webhook"**
3. Configure:
   - **Name**: `proactive-alarm-to-chat-webhook`
   - **Table**: `proactive_vehicle_events`
   - **Events**: `INSERT` (check box)
   - **Type**: `Edge Function`
   - **Function**: `proactive-alarm-to-chat`
   - **HTTP Method**: `POST`
4. Click **"Save"**

### Step 3: Test

After setting up the webhook, create a test event:

```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message
)
VALUES (
  'TEST_DEVICE_001', 'critical_battery', 'critical', 
  'Webhook Test', 'Testing webhook instead of net.http_post'
);
```

The webhook will automatically call the edge function.

---

## Benefits of Webhooks

✅ **More Reliable** - Handled by Supabase infrastructure  
✅ **No pg_net Required** - Works without extensions  
✅ **Better Error Handling** - Errors are logged in webhook logs  
✅ **Retry Mechanism** - Built-in retry for failed calls  
✅ **No Configuration** - No need to store URLs/keys in database  

---

## Verification

After setting up webhook:
1. Create test event
2. Check webhook logs: Dashboard → Database → Webhooks → [your webhook] → Logs
3. Check edge function logs: Dashboard → Edge Functions → proactive-alarm-to-chat → Logs

---

## Current Issue

The trigger is firing but `net.http_post` might be failing silently. Using webhooks is the recommended solution for production.
