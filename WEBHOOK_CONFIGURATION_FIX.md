# Fix Webhook Configuration - "Webhook Not Found" Error

## Problem
Your webhook configuration is mixing two different approaches:
1. **Edge Function section** (showing `proactive-alarm-to-chat`)
2. **HTTP Request type** (with URL field)

This causes a conflict. You need to choose ONE approach.

## Solution: Use "Supabase Edge Functions" Type

### Step 1: Change Webhook Type
1. In the "Webhook configuration" section, find **"Type of webhook"**
2. You should see two options:
   - "HTTP Request" (currently selected - has globe icon)
   - "Supabase Edge Functions" (has Supabase logo icon)
3. **Click on "Supabase Edge Functions"**

### Step 2: After Selecting Edge Functions Type
Once you select "Supabase Edge Functions", the configuration will change to show:
- **Select which edge function to trigger**: Dropdown to choose `proactive-alarm-to-chat`
- **Timeout**: Set to 5000ms (default is fine)

### Step 3: Remove HTTP Headers/Parameters
When using "Supabase Edge Functions" type:
- You DON'T need HTTP Headers section
- You DON'T need HTTP Parameters section
- You DON'T need HTTP Request Body section
- Supabase handles all of this automatically

### Step 4: Verify Edge Function Exists
Before saving, make sure:
1. Go to **Edge Functions** (left sidebar)
2. Check if `proactive-alarm-to-chat` exists in the list
3. If it doesn't exist, you need to deploy it first

### Step 5: Save the Webhook
1. Click **"Update webhook"** button
2. The webhook should save successfully

## Alternative: If Edge Function Doesn't Exist

If the edge function `proactive-alarm-to-chat` doesn't exist yet:

1. **Deploy the edge function first:**
   - Go to Edge Functions → Create new function
   - Name: `proactive-alarm-to-chat`
   - Copy code from `supabase/functions/proactive-alarm-to-chat/index.ts`
   - Deploy it

2. **Then configure the webhook** using "Supabase Edge Functions" type

## Why "Webhook Not Found" Error?

This error typically means:
- The edge function name doesn't match exactly
- The edge function isn't deployed
- There's a configuration conflict (mixing HTTP Request and Edge Function settings)

## Quick Checklist

Before saving the webhook:
- [ ] Edge function `proactive-alarm-to-chat` exists and is deployed
- [ ] Webhook type is set to "Supabase Edge Functions" (not "HTTP Request")
- [ ] Edge function dropdown shows `proactive-alarm-to-chat` selected
- [ ] HTTP Headers/Parameters sections are empty or removed (if using Edge Function type)
