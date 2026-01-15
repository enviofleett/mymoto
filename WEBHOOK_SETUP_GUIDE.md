# Supabase Webhook Setup Guide

Since the `net` extension is not available in your Supabase instance, we'll use **Supabase Database Webhooks** instead.

## Step 1: Run the Webhook-Compatible Migration

Run this migration file in Supabase SQL Editor:
- `supabase/migrations/20260114000004_trigger_alarm_to_chat_webhook.sql`

This creates a simple trigger that fires on INSERT (the webhook handles the HTTP call).

## Step 2: Set Up the Webhook in Supabase Dashboard

1. **Go to Supabase Dashboard** → Your Project → **Database** → **Webhooks**

2. **Click "Create a new webhook"**

3. **Configure the webhook:**

   **Basic Settings:**
   - **Name**: `alarm-to-chat-webhook`
   - **Table**: `proactive_vehicle_events`
   - **Events**: Select `INSERT` only
   - **Enabled**: ✅ (checked)

   **HTTP Request:**
   - **HTTP Method**: `POST`
   - **URL**: `https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/proactive-alarm-to-chat`
   
   **HTTP Headers:**
   ```
   Authorization: Bearer YOUR_SERVICE_ROLE_KEY
   Content-Type: application/json
   ```
   
   > **Note**: Replace `YOUR_SERVICE_ROLE_KEY` with your actual service role key from Dashboard → Settings → API

   **HTTP Request Body (JSON):**
   ```json
   {
     "event": {
       "id": "{{ $new.id }}",
       "device_id": "{{ $new.device_id }}",
       "event_type": "{{ $new.event_type }}",
       "severity": "{{ $new.severity }}",
       "title": "{{ $new.title }}",
       "message": "{{ $new.message }}",
       "metadata": {{ $new.metadata }},
       "created_at": "{{ $new.created_at }}"
     }
   }
   ```

4. **Click "Save"**

## Step 3: Test the Webhook

1. **Create a test alarm:**
   ```sql
   INSERT INTO proactive_vehicle_events (
     device_id, 
     event_type, 
     severity, 
     title, 
     message, 
     metadata
   )
   VALUES (
     'YOUR_DEVICE_ID',
     'test',
     'warning',
     'Test Alarm',
     'This is a test alarm',
     '{}'::jsonb
   );
   ```

2. **Check the webhook logs:**
   - Go to Dashboard → Database → Webhooks
   - Click on your webhook
   - Check "Recent deliveries" tab for success/failure

3. **Verify the chat message:**
   - Go to the vehicle chat page
   - You should see a proactive message from the AI

## Troubleshooting

### Webhook Not Firing
- ✅ Verify trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_alarm_to_chat';`
- ✅ Check webhook is enabled in Dashboard
- ✅ Verify table name matches exactly: `proactive_vehicle_events`

### 401 Unauthorized Error
- ✅ Check service role key is correct in webhook headers
- ✅ Verify key has `service_role` scope

### Edge Function Not Receiving Data
- ✅ Check webhook payload format matches the edge function's expected format
- ✅ Verify all required fields are included in the payload template

### Edge Function Errors
- ✅ Check edge function logs: Dashboard → Edge Functions → proactive-alarm-to-chat → Logs
- ✅ Verify `LOVABLE_API_KEY` is set in edge function secrets

## Alternative: Manual Processing (If Webhooks Don't Work)

If webhooks aren't available, you can use a cron job to periodically process unprocessed events:

```sql
-- Create a function to process unprocessed events
CREATE OR REPLACE FUNCTION process_pending_alarms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_record RECORD;
BEGIN
  -- This would require calling the edge function via HTTP
  -- Since net extension isn't available, you'd need to use
  -- an external service or Supabase Edge Function scheduler
  RAISE NOTICE 'This requires external HTTP call capability';
END;
$$;
```

But webhooks are the recommended approach for Supabase.
