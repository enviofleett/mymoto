# ✅ Proactive AI Conversations - Complete Setup Guide

## 🎯 Overview

This implementation adds three key features:
1. **User Preference Settings** - Users can choose which events trigger AI conversations
2. **Event-Driven Conversations** - AI automatically starts conversations when events occur
3. **Morning Briefing** - Daily morning reports summarizing yesterday's activity

---

## 📋 Task 1: User Preference Settings ✅

### Files Modified:
- ✅ `src/hooks/useNotificationPreferences.ts` - Added `AIChatPreferences` interface and sync to database
- ✅ `src/pages/NotificationSettings.tsx` - Added "AI Companion Triggers" section

### Database Migration:
- ✅ `supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql` - Creates preferences table

### Features:
- Users can toggle AI conversations for:
  - Ignition Start
  - Geofence Events
  - Overspeeding
  - Low Battery
  - Power Off
- Preferences sync to database automatically
- Default: All disabled (opt-in)

---

## 📋 Task 2: Event-Driven Conversation Logic ✅

### Files Created:
- ✅ `supabase/functions/handle-vehicle-event/index.ts` - Main edge function

### Features:
- Triggered via Database Webhook on `proactive_vehicle_events` INSERT
- Checks `llm_enabled` in `vehicle_llm_settings`
- Checks user preferences in `user_ai_chat_preferences`
- Generates LLM response with vehicle personality
- Inserts message into `vehicle_chat_history` with embeddings
- Maps event types to preferences:
  - `ignition_on` → `ignition_start`
  - `ignition_off` → `power_off`
  - `geofence_enter/exit` → `geofence_event`
  - `low_battery/critical_battery` → `low_battery`
  - `overspeeding` → `overspeeding`

---

## 📋 Task 3: Morning Briefing ✅

### Files Created:
- ✅ `supabase/functions/morning-briefing/index.ts` - Morning briefing function

### Features:
- Generates morning report at 7:00 AM (user local time)
- Summarizes:
  - **Night Status**: Battery changes, movement detection
  - **Yesterday's Stats**: Total trips, distance, duration
- Uses vehicle personality and language preferences
- Inserts into `vehicle_chat_history` with embeddings

---

## 🚀 Deployment Steps

### Step 1: Run Database Migration

```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql
```

### Step 2: Deploy Edge Functions

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Deploy handle-vehicle-event
supabase functions deploy handle-vehicle-event

# Deploy morning-briefing
supabase functions deploy morning-briefing
```

### Step 3: Set Up Database Webhook

1. Go to Supabase Dashboard → Database → Webhooks
2. Click "Create a new webhook"
3. Configure:
   - **Name**: `proactive-event-to-chat`
   - **Table**: `proactive_vehicle_events`
   - **Events**: `INSERT`
   - **Type**: `HTTP Request`
   - **URL**: `https://[YOUR_PROJECT_REF].supabase.co/functions/v1/handle-vehicle-event`
   - **HTTP Method**: `POST`
   - **HTTP Headers**: 
     ```
     Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]
     Content-Type: application/json
     ```
4. Save

### Step 4: Set Up Morning Briefing Cron Job

**Option A: Supabase pg_cron (Recommended)**

```sql
-- Run in Supabase SQL Editor
SELECT cron.schedule(
  'morning-briefing-daily',
  '0 7 * * *', -- 7:00 AM UTC daily (adjust for your timezone)
  $$
  SELECT
    net.http_post(
      url := 'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/morning-briefing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer [YOUR_SERVICE_ROLE_KEY]'
      ),
      body := jsonb_build_object('device_id', device_id)
    )
  FROM vehicles
  WHERE device_id IN (
    SELECT device_id FROM vehicle_llm_settings WHERE llm_enabled = true
  );
  $$
);
```

**Option B: External Cron Service (e.g., cron-job.org)**

- URL: `https://[YOUR_PROJECT_REF].supabase.co/functions/v1/morning-briefing?device_id=[DEVICE_ID]`
- Method: POST
- Headers: `Authorization: Bearer [SERVICE_ROLE_KEY]`
- Schedule: Daily at 7:00 AM (user's local timezone)

---

## 🔧 Configuration

### Required Secrets

Ensure these are set in Supabase Dashboard → Settings → Edge Functions → Secrets:
- `LOVABLE_API_KEY` - For LLM API calls
- `SUPABASE_URL` - Auto-configured
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-configured

### Optional Secrets
- `MAPBOX_ACCESS_TOKEN` - For location reverse geocoding (if not set, uses coordinates)

---

## 📊 How It Works

### Event Flow:

1. **Event Occurs** → `proactive_vehicle_events` INSERT
2. **Webhook Triggers** → `handle-vehicle-event` function
3. **Checks**:
   - Is LLM enabled? (`vehicle_llm_settings.llm_enabled`)
   - Do users have this event type enabled? (`user_ai_chat_preferences`)
4. **Generates Message** → LLM with vehicle personality
5. **Saves to Chat** → `vehicle_chat_history` with embeddings
6. **User Sees** → Message appears in chat interface

### Morning Briefing Flow:

1. **Cron Triggers** → `morning-briefing` function (7:00 AM)
2. **Fetches Data**:
   - Night status (battery, movement)
   - Yesterday's trips
3. **Generates Briefing** → LLM with vehicle personality
4. **Saves to Chat** → `vehicle_chat_history` with embeddings
5. **User Sees** → Morning message in chat

---

## ✅ Testing

### Test Event-Driven Conversations:

1. Enable a preference (e.g., "Ignition Start") in Notification Settings
2. Trigger an event (e.g., start vehicle ignition)
3. Check chat - should see proactive message

### Test Morning Briefing:

1. Manually invoke:
```bash
curl -X POST https://[YOUR_PROJECT_REF].supabase.co/functions/v1/morning-briefing \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "YOUR_DEVICE_ID"}'
```

2. Check chat - should see morning briefing message

---

## 📝 Notes

- **Cost Optimization**: Function checks `llm_enabled` before generating tokens
- **User Isolation**: Each user only sees their own chat messages
- **RAG Integration**: All messages include embeddings for semantic search
- **Personality**: Messages respect vehicle's nickname, language, and personality mode

---

**All features implemented and ready to deploy!** 🎉
