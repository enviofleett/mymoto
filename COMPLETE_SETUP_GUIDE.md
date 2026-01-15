# Complete Setup Guide - Proactive Alarm System

## Overview

This guide walks you through the complete setup of the proactive alarm system, including all required tables, migrations, and test data.

## Prerequisites

- Supabase project with database access
- Service role key (from Dashboard → Settings → API)
- Edge function deployment capability

## Step-by-Step Setup

### Step 1: Create Required Base Tables

Run these SQL scripts **in order** in Supabase SQL Editor:

#### 1.1 Create Profiles & Vehicle Assignments
```sql
-- File: CREATE_VEHICLE_ASSIGNMENTS_TABLE.sql
```
This creates:
- `profiles` table (driver/personnel information)
- `vehicle_assignments` table (links devices to profiles)

#### 1.2 Create Proactive Events Table
```sql
-- File: CREATE_PROACTIVE_EVENTS_TABLE.sql
```
This creates:
- `proactive_vehicle_events` table (stores alarms/events)

#### 1.3 Verify Vehicles Table Exists
```sql
-- Check if vehicles table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'vehicles'
);

-- If not, create it:
CREATE TABLE IF NOT EXISTS public.vehicles (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    group_id TEXT,
    group_name TEXT,
    device_type TEXT,
    sim_number TEXT,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

#### 1.4 Verify Vehicle Chat History Exists
```sql
-- Check if vehicle_chat_history exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'vehicle_chat_history'
);

-- If not, create it:
CREATE TABLE IF NOT EXISTS public.vehicle_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    user_id UUID,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Step 2: Run Migrations in Order

Run these migrations **in this exact order**:

1. **`20260114000003_fix_alarm_rls_policies.sql`**
   - Updates RLS policies for security
   - Requires: `proactive_vehicle_events`, `vehicle_assignments`, `profiles`

2. **`20260114000005_add_proactive_chat_columns.sql`**
   - Adds `is_proactive` and `alert_id` columns to `vehicle_chat_history`
   - Requires: `vehicle_chat_history`, `proactive_vehicle_events`

3. **`20260114000004_trigger_alarm_to_chat_webhook.sql`**
   - Creates trigger function for webhook
   - Requires: `proactive_vehicle_events`

4. **`20260114000006_create_ai_training_scenarios.sql`** (Optional)
   - Creates AI training scenarios table
   - For admin AI training feature

### Step 3: Verify Everything

Run the verification script:

```sql
-- File: VERIFY_AND_SETUP_COMPLETE.sql
```

This will:
- ✅ Check all required tables exist
- ✅ Verify table schemas are correct
- ✅ Check triggers and functions exist
- ✅ Verify RLS policies are set up
- ✅ Set up test data automatically
- ✅ Provide a summary report

### Step 4: Set Up Webhook

1. Go to **Supabase Dashboard** → **Database** → **Webhooks**
2. Click **"Create a new webhook"**
3. Configure:
   - **Name**: `alarm-to-chat-webhook`
   - **Table**: `proactive_vehicle_events`
   - **Events**: `INSERT` only
   - **HTTP Method**: `POST`
   - **URL**: `https://YOUR_PROJECT.supabase.co/functions/v1/proactive-alarm-to-chat`
   - **Headers**:
     - `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`
     - `Content-Type: application/json`
   - **Request Body** (JSON):
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

### Step 5: Deploy Edge Function

Deploy the `proactive-alarm-to-chat` edge function:

```bash
# Using Supabase CLI
supabase functions deploy proactive-alarm-to-chat

# Or deploy via Dashboard → Edge Functions → Deploy
```

**Required Environment Variables:**
- `LOVABLE_API_KEY` - For LLM message generation
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### Step 6: Test the System

#### 6.1 Create Test Alarm

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
  'Test Alarm',
  'This is a test alarm to verify the system',
  '{}'::jsonb
);
```

#### 6.2 Verify Webhook Delivery

1. Go to **Dashboard** → **Database** → **Webhooks**
2. Click on `alarm-to-chat-webhook`
3. Check **"Recent deliveries"** tab
4. Should show a successful POST request

#### 6.3 Verify Edge Function

1. Go to **Dashboard** → **Edge Functions** → `proactive-alarm-to-chat`
2. Check **Logs** tab
3. Should show processing of the event

#### 6.4 Verify Chat Message

1. Navigate to: `/owner/chat/358657105967694`
2. You should see a proactive AI message
3. Message should match vehicle's personality settings

## Troubleshooting

### Table Doesn't Exist
- Run the CREATE TABLE scripts in Step 1
- Check table names match exactly (case-sensitive)

### RLS Policy Error
- Ensure `vehicle_assignments` and `profiles` tables exist first
- Run migrations in the correct order

### Webhook Not Firing
- Verify trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_alarm_to_chat';`
- Check webhook is enabled in Dashboard
- Verify table name matches: `proactive_vehicle_events`

### Edge Function Errors
- Check `LOVABLE_API_KEY` is set in edge function secrets
- Verify service role key is correct
- Check edge function logs for detailed errors

### No Chat Message Appears
- Verify `vehicle_chat_history` table exists
- Check edge function logs for errors
- Verify vehicle has LLM settings configured
- Check RLS policies allow insertion

## Verification Checklist

Before going to production, verify:

- [ ] All tables exist (run `VERIFY_AND_SETUP_COMPLETE.sql`)
- [ ] All migrations have been run successfully
- [ ] Webhook is configured and enabled
- [ ] Edge function is deployed with correct secrets
- [ ] Test alarm creates a chat message
- [ ] RLS filtering works (users only see their vehicles)
- [ ] LLM generates messages with correct personality
- [ ] Notification banners appear for warnings/errors

## Files Reference

- `CREATE_VEHICLE_ASSIGNMENTS_TABLE.sql` - Creates profiles & assignments
- `CREATE_PROACTIVE_EVENTS_TABLE.sql` - Creates events table
- `VERIFY_AND_SETUP_COMPLETE.sql` - Verification & test data script
- `20260114000003_fix_alarm_rls_policies.sql` - RLS policies
- `20260114000005_add_proactive_chat_columns.sql` - Chat columns
- `20260114000004_trigger_alarm_to_chat_webhook.sql` - Trigger function
- `WEBHOOK_SETUP_GUIDE.md` - Detailed webhook setup
- `TEST_ALARM.sql` - Test alarm SQL

## Support

If you encounter issues:
1. Run `VERIFY_AND_SETUP_COMPLETE.sql` to diagnose
2. Check Supabase logs (Database → Logs)
3. Check Edge Function logs
4. Verify webhook delivery status
