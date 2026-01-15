# Step-by-Step Webhook Setup Guide

## Step 1: Verify Edge Function Exists

**First, check if the edge function is deployed:**

1. In Supabase Dashboard, click **"Edge Functions"** in the left sidebar (not "Database Webhooks")
2. Look for `proactive-alarm-to-chat` in the list
3. **If it exists:** Great! Proceed to Step 2
4. **If it doesn't exist:** You need to deploy it first (see Step 1.5 below)

### Step 1.5: Deploy Edge Function (If It Doesn't Exist)

1. In Edge Functions page, click **"Create a new function"**
2. **Name:** `proactive-alarm-to-chat` (must match exactly)
3. **Code:** Copy the entire code from `supabase/functions/proactive-alarm-to-chat/index.ts`
4. **Secrets:** Add these environment variables:
   - `LOVABLE_API_KEY` - Your Lovable API key
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Your service role key
5. Click **"Deploy"**

## Step 2: Configure Webhook

**Now go back to Database Webhooks:**

1. Click **"Database Webhooks"** in the left sidebar (under Integrations)
2. Click on your webhook: `alarm-to-chat-webhook`
3. In the right panel, find **"Webhook configuration"** section
4. Look for **"Type of webhook"** - you should see two cards:
   - **"HTTP Request"** (globe icon) - currently selected
   - **"Supabase Edge Functions"** (Supabase logo icon) - **CLICK THIS ONE**

## Step 3: Select Edge Function

**After clicking "Supabase Edge Functions":**

1. The configuration will change
2. You should now see:
   - **"Select which edge function to trigger"** dropdown
   - **"Timeout"** field (default 5000ms is fine)
3. Click the dropdown and select `proactive-alarm-to-chat`
4. The HTTP Headers/Parameters sections should disappear (they're not needed)

## Step 4: Save

1. Click **"Update webhook"** button
2. Should save successfully now

## Troubleshooting

### If "Select which edge function to trigger" dropdown is empty:

- The edge function doesn't exist or isn't deployed
- Go back to Step 1.5 and deploy it first

### If you don't see "Supabase Edge Functions" option:

- Make sure you're in the right place: Database Webhooks → Edit webhook
- Try refreshing the page
- Make sure you have the right permissions

### If you still get "webhook not found" error:

- Verify edge function name is exactly: `proactive-alarm-to-chat` (case-sensitive)
- Check edge function is deployed and active
- Try deleting and recreating the webhook
