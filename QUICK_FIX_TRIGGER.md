# Quick Fix: Trigger Configuration

## Problem
The trigger `notify_alarm_to_chat()` is not configured. It needs:
- `supabase_url` - Your Supabase project URL
- `supabase_service_role_key` - Service role key for authentication

## Solution

### Step 1: Find Your Supabase Credentials

1. **Supabase URL:**
   - Go to: Supabase Dashboard → Project Settings → API
   - Copy "Project URL" (e.g., `https://xxxxxxxxxxxxx.supabase.co`)

2. **Service Role Key:**
   - Go to: Supabase Dashboard → Project Settings → API
   - Copy "service_role" key from "Project API keys" section
   - ⚠️ **WARNING:** This key has admin privileges. Keep it secure!

### Step 2: Update Configuration

Edit `FIX_TRIGGER_CONFIGURATION.sql` and replace:
- `YOUR_SUPABASE_URL` → Your actual Supabase project URL
- `YOUR_SERVICE_ROLE_KEY` → Your actual service role key

### Step 3: Run the Fix

```sql
-- Run FIX_TRIGGER_CONFIGURATION.sql
-- This will:
-- 1. Update the trigger function to use app_settings table
-- 2. Store your Supabase URL and service role key
-- 3. Verify the configuration
```

### Step 4: Test

After running the fix, test by creating a new proactive event:

```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message
)
VALUES (
  'TEST_DEVICE_001', 'critical_battery', 'critical', 
  'Test Event', 'Testing trigger configuration'
);

-- Wait a few seconds, then check:
SELECT notified, notified_at 
FROM proactive_vehicle_events 
WHERE device_id = 'TEST_DEVICE_001' 
ORDER BY created_at DESC 
LIMIT 1;
```

## Alternative: Use Supabase Webhook

If you prefer not to store credentials in the database, you can use Supabase Database Webhooks instead:

1. Go to Supabase Dashboard → Database → Webhooks
2. Create new webhook:
   - Table: `proactive_vehicle_events`
   - Events: `INSERT`
   - Type: `Edge Function`
   - Function: `proactive-alarm-to-chat`

This method doesn't require storing credentials in the database.
