# 🚀 Deploy Proactive AI Conversations Features

## ✅ What's Been Implemented

### Task 1: User Preference Settings ✅
- ✅ Added `AIChatPreferences` interface
- ✅ Added UI section in NotificationSettings
- ✅ Database sync for preferences
- ✅ Migration file created

### Task 2: Event-Driven Conversations ✅
- ✅ Created `handle-vehicle-event` edge function
- ✅ Checks LLM enabled status
- ✅ Checks user preferences
- ✅ Generates LLM responses with personality
- ✅ Saves to chat history with embeddings

### Task 3: Morning Briefing ✅
- ✅ Created `morning-briefing` edge function
- ✅ Fetches night status (battery, movement)
- ✅ Fetches yesterday's trip statistics
- ✅ Generates warm morning message
- ✅ Saves to chat history with embeddings

---

## 📋 Deployment Checklist

### 1. Run Database Migration

```sql
-- Copy and paste into Supabase SQL Editor
-- File: supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql
```

### 2. Deploy Edge Functions

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Deploy handle-vehicle-event
supabase functions deploy handle-vehicle-event

# Deploy morning-briefing
supabase functions deploy morning-briefing
```

### 3. Set Up Database Webhook

**In Supabase Dashboard:**
1. Go to Database → Webhooks
2. Create new webhook:
   - **Name**: `proactive-event-to-chat`
   - **Table**: `proactive_vehicle_events`
   - **Events**: `INSERT`
   - **Type**: `HTTP Request`
   - **URL**: `https://[YOUR_PROJECT_REF].supabase.co/functions/v1/handle-vehicle-event`
   - **Method**: `POST`
   - **Headers**: 
     ```
     Authorization: Bearer [SERVICE_ROLE_KEY]
     Content-Type: application/json
     ```

### 4. Set Up Morning Briefing Cron

**Option A: pg_cron (if available)**
```sql
SELECT cron.schedule(
  'morning-briefing-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(...)
  FROM vehicles WHERE device_id IN (SELECT device_id FROM vehicle_llm_settings WHERE llm_enabled = true);
  $$
);
```

**Option B: External Cron Service**
- Schedule daily at 7:00 AM
- POST to: `https://[PROJECT_REF].supabase.co/functions/v1/morning-briefing?device_id=[DEVICE_ID]`
- Header: `Authorization: Bearer [SERVICE_ROLE_KEY]`

---

## 🧪 Testing

### Test Preferences UI:
1. Go to Notification Settings
2. Find "AI Companion Triggers" section
3. Toggle any preference
4. Check database: `SELECT * FROM user_ai_chat_preferences;`

### Test Event-Driven Chat:
1. Enable "Ignition Start" preference
2. Trigger ignition event (or manually insert into `proactive_vehicle_events`)
3. Check chat - should see proactive message

### Test Morning Briefing:
```bash
curl -X POST https://[PROJECT_REF].supabase.co/functions/v1/morning-briefing \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "YOUR_DEVICE_ID"}'
```

---

## 📝 Files Created/Modified

### Created:
- `supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql`
- `supabase/functions/handle-vehicle-event/index.ts`
- `supabase/functions/morning-briefing/index.ts`
- `PROACTIVE_AI_CONVERSATIONS_SETUP.md`

### Modified:
- `src/hooks/useNotificationPreferences.ts`
- `src/pages/NotificationSettings.tsx`

---

**Ready to deploy!** 🎉
