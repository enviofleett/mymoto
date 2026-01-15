# Fix Webhook Configuration and 401 Errors

## Problem Identified

1. **Webhook Type is Wrong**: Your webhook is configured as "HTTP Request" but should be "Supabase Edge Functions"
2. **401 Unauthorized Errors**: The edge function is receiving requests but rejecting them due to authentication

## Solution

### Step 1: Change Webhook Type to "Supabase Edge Functions"

1. In the webhook configuration panel (right side), find **"Type of webhook"** section
2. Click on **"Supabase Edge Functions"** (the option with the Supabase logo)
3. This will change the configuration to use the edge function directly

### Step 2: Configure Edge Function Webhook

After selecting "Supabase Edge Functions", you should see:
- **Select which edge function to trigger**: Choose `proactive-alarm-to-chat`
- The webhook will automatically handle authentication

### Step 3: Update the Webhook

Click **"Update webhook"** button to save the changes

### Step 4: Test Again

After updating, create a new test alarm:

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
  '358657105967694',
  'test',
  'warning',
  'Test Alarm - After Webhook Fix',
  'This is a test alarm after fixing the webhook configuration',
  '{}'::jsonb
);
```

## Why This Fixes the 401 Error

When you use "HTTP Request" type, you need to manually configure authentication headers. When you use "Supabase Edge Functions" type, Supabase automatically:
- Handles authentication
- Passes the request body correctly
- Manages the connection properly

## Alternative: If You Must Use HTTP Request Type

If you need to keep "HTTP Request" type, you need to:
1. Get your service role key from Dashboard → Settings → API
2. Make sure the Authorization header is: `Bearer YOUR_SERVICE_ROLE_KEY`
3. Ensure the edge function allows unauthenticated requests OR uses the service role key

But using "Supabase Edge Functions" type is much simpler and recommended.
