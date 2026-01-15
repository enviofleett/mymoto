# How to Set Up Webhook Payload in Supabase Dashboard

## Step-by-Step Instructions

### 1. Navigate to Webhooks
1. Go to your **Supabase Dashboard**
2. Select your project
3. Click **Database** in the left sidebar
4. Click **Webhooks** tab

### 2. Create New Webhook
1. Click **"Create a new webhook"** button (or **"New webhook"**)

### 3. Basic Configuration
Fill in the basic settings:

- **Name**: `alarm-to-chat-webhook`
- **Table**: Select `proactive_vehicle_events` from dropdown
- **Events**: Check only **INSERT** (uncheck UPDATE and DELETE)
- **Enabled**: ✅ Make sure it's checked

### 4. HTTP Request Configuration

#### HTTP Method
- Select **POST** from dropdown

#### URL
Enter your edge function URL:
```
https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/proactive-alarm-to-chat
```

> **Note**: Replace `cmvpnsqiefbsqkwnraka` with your actual Supabase project reference ID if different.

### 5. HTTP Headers
Click **"Add header"** for each header:

**Header 1:**
- **Name**: `Authorization`
- **Value**: `Bearer YOUR_SERVICE_ROLE_KEY`

**Header 2:**
- **Name**: `Content-Type`
- **Value**: `application/json`

> **How to get your Service Role Key:**
> 1. Go to Dashboard → **Settings** → **API**
> 2. Find **"service_role"** key (under "Project API keys")
> 3. Click the eye icon to reveal it
> 4. Copy the entire key
> 5. Paste it in the Authorization header value (after `Bearer `)

### 6. HTTP Request Body (The JSON Payload)

This is the important part! In the **"HTTP Request Body"** field:

1. Make sure the dropdown is set to **"JSON"** (not "Text" or "Form")
2. Paste this exact JSON:

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

**Important Notes:**
- The `{{ $new.field_name }}` syntax is Supabase's template syntax
- It automatically replaces with actual values from the inserted row
- Keep the double curly braces exactly as shown
- For `metadata`, use `{{ $new.metadata }}` without quotes (it's already JSON)

### 7. Save the Webhook
1. Click **"Save"** or **"Create webhook"** button
2. You should see a success message

### 8. Verify Setup
After saving, you should see:
- ✅ Webhook listed in the webhooks table
- ✅ Status shows as "Active" or "Enabled"
- ✅ Recent deliveries section (will be empty until first trigger)

## Visual Guide

The webhook form should look like this:

```
┌─────────────────────────────────────────┐
│ Webhook Configuration                   │
├─────────────────────────────────────────┤
│ Name: alarm-to-chat-webhook             │
│ Table: proactive_vehicle_events       │
│ Events: ☑ INSERT  ☐ UPDATE  ☐ DELETE   │
│                                         │
│ HTTP Request                            │
│ Method: [POST ▼]                       │
│ URL: https://.../functions/v1/...      │
│                                         │
│ Headers:                                │
│   Authorization: Bearer eyJhbGc...      │
│   Content-Type: application/json       │
│                                         │
│ Request Body:                           │
│ [JSON ▼]                                │
│ ┌─────────────────────────────────────┐ │
│ │ {                                    │ │
│ │   "event": {                        │ │
│ │     "id": "{{ $new.id }}",         │ │
│ │     "device_id": "{{ $new.device_  │ │
│ │     ...                             │ │
│ │   }                                 │ │
│ │ }                                    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Save] [Cancel]                        │
└─────────────────────────────────────────┘
```

## Troubleshooting

### "Invalid JSON" Error
- Make sure you're using the **JSON** format (not Text)
- Check that all quotes are straight quotes (`"`), not curly quotes (`"` or `"`)
- Verify the template syntax `{{ $new.field }}` is correct

### Template Variables Not Working
- Make sure field names match your table columns exactly
- Use `$new` for INSERT events (not `$old`)
- Check that the table name is correct: `proactive_vehicle_events`

### Webhook Not Firing
- Verify the trigger exists: Run `SELECT * FROM pg_trigger WHERE tgname = 'trigger_alarm_to_chat';`
- Check webhook is enabled
- Verify table name matches exactly

### 401 Unauthorized
- Double-check the service role key is correct
- Make sure there's a space after `Bearer` in the header
- Verify the key hasn't been rotated

## Test the Webhook

After setup, test it:

```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata
)
VALUES (
  'YOUR_DEVICE_ID',
  'test',
  'warning',
  'Test Alarm',
  'This is a test',
  '{}'::jsonb
);
```

Then check:
1. **Webhook Logs**: Dashboard → Database → Webhooks → Click your webhook → "Recent deliveries"
2. **Edge Function Logs**: Dashboard → Edge Functions → proactive-alarm-to-chat → Logs
3. **Chat**: Go to vehicle chat page and verify message appears
