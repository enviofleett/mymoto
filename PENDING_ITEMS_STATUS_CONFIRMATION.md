# 📊 Pending Items Status Confirmation

**Date:** January 16, 2026  
**Checked:** All pending deployment items

---

## ✅ Status Confirmation

### 1. **Database Migration — `user_ai_chat_preferences` table** ⏳

**Status:** ⏳ **PENDING** (Migration file ready, needs execution)

**File Location:**
- ✅ `supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql`
- ✅ **FIXED:** Now idempotent (can be run multiple times safely)

**What It Does:**
- Creates `user_ai_chat_preferences` table
- Sets up RLS policies
- Creates indexes
- Creates trigger for `updated_at`

**Current Impact:**
- ✅ Frontend UI works (saves to localStorage)
- ❌ Preferences won't sync to database
- ❌ Edge functions can't check user preferences
- ❌ Preferences lost on logout/clear cache

**Action Required:**
```sql
-- Copy entire file content from:
-- supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql
-- Paste into Supabase SQL Editor and run
```

**Verification:**
```sql
-- After running, verify with:
SELECT * FROM user_ai_chat_preferences LIMIT 1;
-- Should return empty result (no error = table exists)
```

**Time:** 2 minutes

---

### 2. **Edge Function: `handle-vehicle-event`** ⏳

**Status:** ⏳ **PENDING DEPLOYMENT** (Code complete, not deployed)

**File Location:**
- ✅ `supabase/functions/handle-vehicle-event/index.ts`
- ✅ Code is complete and self-contained
- ✅ No module dependencies (embedding generator inlined)

**What It Does:**
- Checks `llm_enabled` before generating tokens
- Checks user preferences for each event type
- Generates LLM responses with vehicle personality
- Saves to `vehicle_chat_history` with embeddings

**Current Impact:**
- ❌ Event-driven conversations won't work
- ❌ User preferences won't be checked
- ❌ No AI messages for events
- ✅ Code is ready to deploy

**Action Required:**
```bash
supabase functions deploy handle-vehicle-event
```

**Or via Dashboard:**
1. Go to Supabase Dashboard → Edge Functions
2. Click "Create Function" or "Deploy Function"
3. Name: `handle-vehicle-event`
4. Copy code from `supabase/functions/handle-vehicle-event/index.ts`
5. Deploy

**Verification:**
```bash
# After deployment, test with:
curl -X POST https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/handle-vehicle-event \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"type":"INSERT","table":"proactive_vehicle_events","record":{"id":"test","device_id":"test","event_type":"ignition_on","severity":"info","title":"Test"}}'
```

**Time:** 5 minutes

---

### 3. **Edge Function: `morning-briefing`** ⏳

**Status:** ⏳ **PENDING DEPLOYMENT** (Code complete, not deployed)

**File Location:**
- ✅ `supabase/functions/morning-briefing/index.ts`
- ✅ Code is complete and self-contained
- ✅ No module dependencies (embedding generator inlined)

**What It Does:**
- Fetches night status (battery changes, movement detection)
- Fetches yesterday's trip statistics
- Generates warm morning message with vehicle personality
- Saves to `vehicle_chat_history` with embeddings

**Current Impact:**
- ❌ Morning briefings won't run automatically
- ❌ Can't be triggered manually (until deployed)
- ✅ Code is ready to deploy

**Action Required:**
```bash
supabase functions deploy morning-briefing
```

**Or via Dashboard:**
1. Go to Supabase Dashboard → Edge Functions
2. Click "Create Function" or "Deploy Function"
3. Name: `morning-briefing`
4. Copy code from `supabase/functions/morning-briefing/index.ts`
5. Deploy

**Verification:**
```bash
# After deployment, test with:
curl -X POST "https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing?device_id=YOUR_DEVICE_ID" \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]"
```

**Time:** 5 minutes

---

### 4. **Database Webhook: `handle-vehicle-event`** ⏳

**Status:** ⏳ **IN PROGRESS** (You're setting this up now)

**Configuration:**
- **Name:** `proactive-event-to-chat` (or any name)
- **Table:** `proactive_vehicle_events`
- **Events:** `INSERT`
- **Type:** `HTTP Request`
- **URL:** `https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/handle-vehicle-event`
- **Method:** `POST`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer [SERVICE_ROLE_KEY]`

**Current Impact:**
- ❌ Function won't be triggered automatically
- ✅ Can still be invoked manually for testing
- ⚠️ **IMPORTANT:** Make sure `handle-vehicle-event` function is deployed FIRST

**Action Required:**
1. Complete webhook setup in Supabase Dashboard
2. Verify URL includes `https://`
3. Add Authorization header with service role key
4. Save webhook

**Verification:**
```sql
-- After setup, test by inserting a test event:
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message
) VALUES (
  'YOUR_DEVICE_ID', 'ignition_on', 'info', 'Test Event', 'Test message'
);

-- Check if message appears in vehicle_chat_history:
SELECT * FROM vehicle_chat_history 
WHERE device_id = 'YOUR_DEVICE_ID' 
ORDER BY created_at DESC 
LIMIT 1;
```

**Time:** 2 minutes (after function is deployed)

---

### 5. **Cron Job: Morning Briefing** ⏳

**Status:** ⏳ **OPTIONAL** (Not required for basic functionality)

**What It Does:**
- Automatically triggers `morning-briefing` function daily at 7:00 AM
- Runs for all vehicles with `llm_enabled = true`

**Current Impact:**
- ❌ Morning briefings won't run automatically
- ✅ Can still be triggered manually (after function is deployed)
- ✅ Not critical for initial testing

**Action Required (Optional):**

**Option A: External Cron Service (Recommended)**
- Use cron-job.org or similar
- Schedule: Daily at 7:00 AM (user's local timezone)
- URL: `https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing?device_id=[DEVICE_ID]`
- Method: POST
- Header: `Authorization: Bearer [SERVICE_ROLE_KEY]`

**Option B: Supabase pg_cron (if available)**
```sql
SELECT cron.schedule(
  'morning-briefing-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [SERVICE_ROLE_KEY]'
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

**Time:** 10 minutes (optional, can be done later)

---

## 📋 Deployment Order (Recommended)

### **Step 1: Database Migration** (2 min)
```sql
-- Run migration SQL
```

### **Step 2: Deploy Edge Functions** (10 min)
```bash
supabase functions deploy handle-vehicle-event
supabase functions deploy morning-briefing
```

### **Step 3: Set Up Webhook** (2 min)
- Complete webhook configuration in Dashboard

### **Step 4: Test** (5 min)
- Enable a preference in UI
- Trigger a test event
- Verify message appears in chat

### **Step 5: Set Up Cron (Optional)** (10 min)
- Configure automatic morning briefings

**Total Time:** ~30 minutes (or ~20 minutes without cron)

---

## ✅ Summary

| Item | Status | Priority | Time |
|------|--------|----------|------|
| Database Migration | ⏳ Pending | 🔴 High | 2 min |
| `handle-vehicle-event` | ⏳ Pending | 🔴 High | 5 min |
| `morning-briefing` | ⏳ Pending | 🟡 Medium | 5 min |
| Database Webhook | ⏳ In Progress | 🔴 High | 2 min |
| Cron Job | ⏳ Optional | 🟢 Low | 10 min |

**All items are confirmed as PENDING and ready for deployment!** ✅
