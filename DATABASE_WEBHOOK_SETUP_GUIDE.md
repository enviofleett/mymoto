# Database Webhook Setup Guide - Step by Step

## Prerequisites
✅ Edge function `proactive-alarm-to-chat` is deployed

## Step-by-Step Instructions

### Step 1: Navigate to Database Webhooks

1. In Supabase Dashboard, click **"Integrations"** in the left sidebar
2. Under **"INSTALLED"**, click **"Database Webhooks"**
3. You should see the "Database Webhooks" page

### Step 2: Create or Edit Webhook

**If webhook doesn't exist:**
1. Click **"Create a new hook"** button (green button, top right)
2. Skip to Step 3

**If webhook already exists (`alarm-to-chat-webhook`):**
1. Click on the webhook name in the table
2. The right panel will open for editing
3. Continue to Step 3

### Step 3: Configure Webhook Name

1. In the **"Name"** field, enter: `alarm-to-chat-webhook`
2. Note: "Do not use spaces/whitespaces"

### Step 4: Set Conditions to Fire Webhook

1. **Table:** 
   - Click the dropdown
   - Select `proactive_vehicle_events`
   - Note: "This is the table the trigger will watch for changes"

2. **Events:**
   - ✅ Check **"Insert"** (this is the one you need)
   - ☐ Leave **"Update"** unchecked
   - ☐ Leave **"Delete"** unchecked
   - Description: "Any insert operation on the table"

### Step 5: Configure Webhook Type (IMPORTANT!)

1. Scroll down to **"Webhook configuration"** section
2. Find **"Type of webhook"** - you'll see two options:
   - **"HTTP Request"** (globe icon with "https://")
   - **"Supabase Edge Functions"** (Supabase logo icon)

3. **Click on "Supabase Edge Functions"** (the one with Supabase logo)

4. After clicking, the configuration will change and show:
   - **"Select which edge function to trigger"** dropdown
   - **"Timeout"** field (default 5000ms is fine)

5. **Select the edge function:**
   - Click the **"Select which edge function to trigger"** dropdown
   - Choose `proactive-alarm-to-chat` from the list

6. **Timeout:** Leave as default (5000ms) or adjust if needed

### Step 6: Remove Unnecessary Sections

When using "Supabase Edge Functions" type:
- **HTTP Headers section:** Can be removed/ignored (not needed)
- **HTTP Parameters section:** Can be removed/ignored (not needed)
- **HTTP Request Body section:** Can be removed/ignored (not needed)

Supabase automatically handles:
- Authentication
- Request formatting
- Data passing

### Step 7: Save the Webhook

1. Scroll to the bottom
2. Click **"Update webhook"** button (green button)
3. You should see a success message

### Step 8: Verify Webhook is Active

1. The webhook should appear in the table with:
   - **Name:** `alarm-to-chat-webhook`
   - **Table:** `proactive_vehicle_events`
   - **Events:** `INSERT`

2. Make sure it's enabled (there should be a toggle switch)

## Testing the Webhook

After setup, test it:

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
  'Test Alarm - Webhook Setup',
  'Testing the webhook configuration',
  '{}'::jsonb
);
```

Then check:
1. **Edge Functions → proactive-alarm-to-chat → Invocations** - Should show a 200 status
2. **Edge Functions → proactive-alarm-to-chat → Logs** - Should show processing logs
3. **Chat message:** Navigate to `/owner/chat/358657105967694` - Should see proactive message

## Troubleshooting

### "Select which edge function to trigger" dropdown is empty
- **Solution:** Make sure the edge function `proactive-alarm-to-chat` is deployed
- Go to Edge Functions and verify it exists

### "Webhook not found" error
- **Solution:** Make sure you selected "Supabase Edge Functions" type (not "HTTP Request")
- Verify edge function name is exactly: `proactive-alarm-to-chat`

### Webhook not firing
- **Solution:** 
  - Check webhook is enabled (toggle switch)
  - Verify table name: `proactive_vehicle_events`
  - Verify event is "INSERT" only
  - Check Edge Functions → Invocations for any errors

### 401 Unauthorized errors
- **Solution:** This shouldn't happen with "Supabase Edge Functions" type
- If it does, try deleting and recreating the webhook

## Visual Checklist

Before saving, verify:
- [ ] Name: `alarm-to-chat-webhook`
- [ ] Table: `proactive_vehicle_events`
- [ ] Events: Only "Insert" checked
- [ ] Type: "Supabase Edge Functions" (not "HTTP Request")
- [ ] Edge Function: `proactive-alarm-to-chat` selected
- [ ] Webhook is enabled

## Summary

The key steps are:
1. Select the correct table (`proactive_vehicle_events`)
2. Select "Insert" event only
3. **Most Important:** Choose "Supabase Edge Functions" type (not "HTTP Request")
4. Select `proactive-alarm-to-chat` from the dropdown
5. Save

That's it! The webhook will now automatically call your edge function whenever a new alarm is created.
