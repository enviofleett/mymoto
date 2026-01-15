# 🚀 Complete Setup Guide: Database Webhook & Cron Job

**Date:** January 16, 2026  
**Functions:** `handle-vehicle-event` and `morning-briefing`

---

## 📋 Prerequisites

Before setting up the webhook and cron, ensure:

1. ✅ **Database migration is run** (`user_ai_chat_preferences` table exists)
2. ✅ **Edge functions are deployed:**
   - `handle-vehicle-event` ✅
   - `morning-briefing` ✅
3. ✅ **Service Role Key** is available:
   - Get from: Supabase Dashboard → Settings → API → `service_role` key

---

## 🔗 Part 1: Database Webhook Setup

### **Purpose:**
Automatically trigger `handle-vehicle-event` when a new `proactive_vehicle_event` is inserted.

### **Step-by-Step Instructions:**

#### **Step 1: Navigate to Webhooks**
1. Go to **Supabase Dashboard**
2. Click **"Database"** in the left sidebar
3. Click **"Webhooks"** (or go to: Integrations → Database Webhooks)

#### **Step 2: Create New Webhook**
1. Click **"Create a new webhook"** button
2. You'll see a form on the right side

#### **Step 3: Configure Webhook**

**Basic Settings:**
- **Name:** `proactive-event-to-chat` (or any name you prefer)
- **Table:** Select `proactive_vehicle_events` from dropdown
- **Events:** Check **`INSERT`** (uncheck UPDATE, DELETE if checked)

**HTTP Request Settings:**
- **Method:** Select **`POST`** from dropdown
- **URL:** 
  ```
  https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/handle-vehicle-event
  ```
  ⚠️ **IMPORTANT:** Must include `https://` at the beginning!

- **Timeout:** `5000` ms (default is fine)

**HTTP Headers:**
Click **"+ Add a new header"** and add:

1. **First Header:**
   - **Key:** `Content-Type`
   - **Value:** `application/json`

2. **Second Header:**
   - **Key:** `Authorization`
   - **Value:** `Bearer [YOUR_SERVICE_ROLE_KEY]`
   
   ⚠️ **Replace `[YOUR_SERVICE_ROLE_KEY]`** with your actual service role key from:
   - Dashboard → Settings → API → `service_role` key

**HTTP Parameters:**
- Leave empty (not needed)

#### **Step 4: Save Webhook**
1. Click **"Create webhook"** button (green button at bottom)
2. You should see the webhook appear in the list

#### **Step 5: Verify Webhook**
1. The webhook should appear under `schema public`
2. It should show:
   - **Table:** `proactive_vehicle_events`
   - **Events:** `INSERT`

---

## ⏰ Part 2: Cron Job Setup (Morning Briefing)

### **Purpose:**
Automatically trigger `morning-briefing` function daily at 7:00 AM.

### **Option A: External Cron Service (Recommended)** ⭐

**Why:** More reliable, easier to manage, supports timezone settings.

#### **Step 1: Choose a Cron Service**
Popular options:
- **cron-job.org** (Free, easy to use)
- **EasyCron** (Free tier available)
- **Cronitor** (Free tier available)

#### **Step 2: Create Cron Job (Using cron-job.org as example)**

1. **Sign up/Login** to cron-job.org
2. **Click "Create Cronjob"**
3. **Configure:**

   **Basic Settings:**
   - **Title:** `Morning Briefing - MyMoto`
   - **URL:** 
     ```
     https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing?device_id=YOUR_DEVICE_ID
     ```
     ⚠️ **Replace `YOUR_DEVICE_ID`** with an actual device ID (or use a script to loop through all devices)
   
   **Schedule:**
   - **Execution Schedule:** `Daily`
   - **Time:** `07:00` (7:00 AM)
   - **Timezone:** Select your timezone (e.g., `Africa/Lagos` for Nigeria)

   **HTTP Method:**
   - **Method:** `POST`
   
   **HTTP Headers:**
   - Click "Add Header"
   - **Header Name:** `Authorization`
   - **Header Value:** `Bearer [YOUR_SERVICE_ROLE_KEY]`
   
   - Click "Add Header" again
   - **Header Name:** `Content-Type`
   - **Header Value:** `application/json`

4. **Save Cron Job**

#### **Step 3: Test Cron Job**
1. Click "Run Now" to test
2. Check Supabase logs to verify function executed
3. Check `vehicle_chat_history` table for morning message

---

### **Option B: Supabase pg_cron (If Available)**

**Note:** Requires `pg_cron` extension to be enabled in your Supabase project.

#### **Step 1: Check if pg_cron is Available**
```sql
-- Run in Supabase SQL Editor
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

If no results, pg_cron is not available. Use Option A instead.

#### **Step 2: Create Cron Job**
```sql
-- Run in Supabase SQL Editor
-- Replace [YOUR_SERVICE_ROLE_KEY] with your actual service role key

SELECT cron.schedule(
  'morning-briefing-daily',
  '0 7 * * *', -- 7:00 AM UTC daily (adjust timezone as needed)
  $$
  SELECT
    net.http_post(
      url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing',
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

#### **Step 3: Verify Cron Job**
```sql
-- Check scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'morning-briefing-daily';

-- Check job run history
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'morning-briefing-daily')
ORDER BY start_time DESC
LIMIT 10;
```

---

## 🧪 Testing

### **Test Database Webhook:**

1. **Insert a test event:**
```sql
-- Run in Supabase SQL Editor
INSERT INTO proactive_vehicle_events (
  device_id, 
  event_type, 
  severity, 
  title, 
  message
) VALUES (
  'YOUR_DEVICE_ID',  -- Replace with actual device ID
  'ignition_on',
  'info',
  'Test Event',
  'This is a test event to verify webhook'
);
```

2. **Check if message was created:**
```sql
-- Check vehicle_chat_history for new message
SELECT * FROM vehicle_chat_history 
WHERE device_id = 'YOUR_DEVICE_ID' 
  AND is_proactive = true
ORDER BY created_at DESC 
LIMIT 1;
```

3. **Check webhook logs:**
- Go to Supabase Dashboard → Edge Functions → `handle-vehicle-event`
- Click "Logs" tab
- Look for recent invocations

---

### **Test Morning Briefing:**

1. **Manually invoke function:**
```bash
curl -X POST "https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing?device_id=YOUR_DEVICE_ID" \
  -H "Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]" \
  -H "Content-Type: application/json"
```

2. **Check if message was created:**
```sql
-- Check vehicle_chat_history for morning briefing
SELECT * FROM vehicle_chat_history 
WHERE device_id = 'YOUR_DEVICE_ID' 
  AND is_proactive = true
  AND content LIKE '%morning%'
ORDER BY created_at DESC 
LIMIT 1;
```

---

## 📊 Verification Checklist

### **Database Webhook:**
- [ ] Webhook created in Supabase Dashboard
- [ ] Webhook points to correct URL (`handle-vehicle-event`)
- [ ] Authorization header includes service role key
- [ ] Test event triggers function (check logs)
- [ ] Message appears in `vehicle_chat_history`

### **Cron Job:**
- [ ] Cron job created (external service or pg_cron)
- [ ] Schedule set to 7:00 AM (correct timezone)
- [ ] Authorization header includes service role key
- [ ] Manual test works (function executes)
- [ ] Message appears in `vehicle_chat_history`

---

## 🔧 Troubleshooting

### **Webhook Not Triggering:**
1. ✅ Verify webhook URL includes `https://`
2. ✅ Check Authorization header has correct service role key
3. ✅ Verify `handle-vehicle-event` function is deployed
4. ✅ Check Edge Function logs for errors
5. ✅ Verify event is actually inserted into `proactive_vehicle_events`

### **Cron Job Not Running:**
1. ✅ Verify cron service is active (not paused)
2. ✅ Check timezone settings match your location
3. ✅ Verify function URL is correct
4. ✅ Check Authorization header has correct service role key
5. ✅ Test manually first to ensure function works

### **Function Errors:**
1. ✅ Check Edge Function logs in Supabase Dashboard
2. ✅ Verify `LOVABLE_API_KEY` is set in secrets
3. ✅ Verify `user_ai_chat_preferences` table exists
4. ✅ Check function logs for specific error messages

---

## 📝 Quick Reference

### **Webhook Configuration:**
```
Name: proactive-event-to-chat
Table: proactive_vehicle_events
Events: INSERT
URL: https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/handle-vehicle-event
Method: POST
Headers:
  - Content-Type: application/json
  - Authorization: Bearer [SERVICE_ROLE_KEY]
```

### **Cron Job Configuration:**
```
URL: https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing?device_id=[DEVICE_ID]
Schedule: Daily at 7:00 AM
Method: POST
Headers:
  - Authorization: Bearer [SERVICE_ROLE_KEY]
  - Content-Type: application/json
```

---

**Both setups are now complete!** 🎉
