# ⏰ Cron Job Setup - Quick Steps

## 🎯 Purpose
Automatically run `morning-briefing` function daily at 7:00 AM.

---

## ⚡ Quick Setup (Using cron-job.org)

### **Step 1: Go to cron-job.org**
- Sign up (free) or login
- Click **"Create Cronjob"**

### **Step 2: Configure Cron Job**

**Basic:**
- **Title:** `Morning Briefing`
- **URL:** 
  ```
  https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing?device_id=YOUR_DEVICE_ID
  ```
  ⚠️ Replace `YOUR_DEVICE_ID` with actual device ID

**Schedule:**
- **Execution:** `Daily`
- **Time:** `07:00`
- **Timezone:** Your timezone (e.g., `Africa/Lagos`)

**HTTP:**
- **Method:** `POST`
- **Header 1:**
  - Name: `Authorization`
  - Value: `Bearer [YOUR_SERVICE_ROLE_KEY]`
- **Header 2:**
  - Name: `Content-Type`
  - Value: `application/json`

### **Step 3: Save & Test**
- Click **"Create"**
- Click **"Run Now"** to test
- Check Supabase logs to verify

---

## 🔄 For Multiple Devices

If you have multiple vehicles, create a script that loops through all devices:

**Option 1: Create separate cron jobs** (one per device)

**Option 2: Use a wrapper function** that calls morning-briefing for all devices:
```typescript
// Create: supabase/functions/morning-briefing-all/index.ts
// This function loops through all devices and calls morning-briefing for each
```

---

## ✅ Done!

The cron job will now automatically trigger morning briefings daily at 7:00 AM.

---

## 🧪 Test Manually:
```bash
curl -X POST "https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing?device_id=YOUR_DEVICE_ID" \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]"
```
