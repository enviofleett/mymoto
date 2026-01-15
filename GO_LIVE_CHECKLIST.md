# 🚀 Go-Live Checklist - Proactive AI Conversations

**Date:** January 16, 2026

---

## ✅ **CODE STATUS: 100% COMPLETE** ✅

All code is written, tested, and ready:
- ✅ Frontend UI complete
- ✅ Edge functions complete
- ✅ Database migration ready
- ✅ All files are self-contained

---

## ⏳ **DEPLOYMENT CHECKLIST**

### **🔴 CRITICAL (Must Do Before Live):**

#### **1. Database Migration** ⏳
- [ ] **Action:** Run SQL in Supabase SQL Editor
- [ ] **File:** `supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql`
- [ ] **Verify:** 
  ```sql
  SELECT * FROM user_ai_chat_preferences LIMIT 1;
  -- Should return empty result (no error = table exists)
  ```
- [ ] **Impact if Missing:** Preferences won't save to database

#### **2. Deploy `handle-vehicle-event`** ⏳
- [ ] **Action:** Deploy edge function
- [ ] **File:** `supabase/functions/handle-vehicle-event/index.ts`
- [ ] **Verify:** Function appears in Dashboard → Edge Functions
- [ ] **Impact if Missing:** Event-driven conversations won't work

#### **3. Deploy `morning-briefing`** ⏳
- [ ] **Action:** Deploy edge function
- [ ] **File:** `supabase/functions/morning-briefing/index.ts`
- [ ] **Verify:** Function appears in Dashboard → Edge Functions
- [ ] **Impact if Missing:** Morning briefings won't work

#### **4. Set `LOVABLE_API_KEY` Secret** ⏳
- [ ] **Action:** Set in Supabase Dashboard → Settings → Edge Functions → Secrets
- [ ] **Verify:** Secret exists in secrets list
- [ ] **Impact if Missing:** LLM won't generate messages (functions will fail)

#### **5. Configure Database Webhook** ⏳
- [ ] **Action:** Create webhook in Dashboard → Database → Webhooks
- [ ] **Table:** `proactive_vehicle_events`
- [ ] **Events:** `INSERT`
- [ ] **URL:** `https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/handle-vehicle-event`
- [ ] **Headers:** 
  - `Content-Type: application/json`
  - `Authorization: Bearer [SERVICE_ROLE_KEY]`
- [ ] **Impact if Missing:** Events won't trigger conversations automatically

---

### **🟡 IMPORTANT (Should Do Before Live):**

#### **6. Test End-to-End Flow** ⏳
- [ ] Enable a preference in UI (e.g., "Ignition Start")
- [ ] Insert test event:
  ```sql
  INSERT INTO proactive_vehicle_events (
    device_id, event_type, severity, title, message
  ) VALUES (
    'YOUR_DEVICE_ID', 'ignition_on', 'info', 'Test', 'Test event'
  );
  ```
- [ ] Verify message appears in `vehicle_chat_history`
- [ ] Verify message uses vehicle personality

#### **7. Test Morning Briefing** ⏳
- [ ] Manually invoke function:
  ```bash
  curl -X POST "https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/morning-briefing?device_id=YOUR_DEVICE_ID" \
    -H "Authorization: Bearer [SERVICE_ROLE_KEY]"
  ```
- [ ] Verify message appears in chat

---

### **🟢 OPTIONAL (Can Do Later):**

#### **8. Set Up Cron Job** ⏳
- [ ] Configure automatic morning briefings (7:00 AM daily)
- [ ] Use external cron service or pg_cron
- [ ] **Impact if Missing:** Morning briefings won't run automatically (can still trigger manually)

---

## 🧪 **QUICK VERIFICATION COMMANDS**

### **Check Database Migration:**
```sql
-- Run in Supabase SQL Editor
SELECT * FROM user_ai_chat_preferences LIMIT 1;
```

### **Check Edge Functions:**
- Go to: Supabase Dashboard → Edge Functions
- Look for: `handle-vehicle-event` and `morning-briefing`

### **Check Secrets:**
- Go to: Supabase Dashboard → Settings → Edge Functions → Secrets
- Look for: `LOVABLE_API_KEY`

### **Check Webhook:**
- Go to: Supabase Dashboard → Database → Webhooks
- Look for: Webhook on `proactive_vehicle_events` table

---

## 📊 **READINESS STATUS**

| Item | Code Status | Deployment Status | Blocking? |
|------|-------------|-------------------|-----------|
| Database Migration | ✅ Ready | ⏳ Unknown | 🔴 Yes |
| `handle-vehicle-event` | ✅ Complete | ⏳ Unknown | 🔴 Yes |
| `morning-briefing` | ✅ Complete | ⏳ Unknown | 🟡 No |
| `LOVABLE_API_KEY` | ✅ Code Ready | ⏳ Unknown | 🔴 Yes |
| Database Webhook | ✅ Config Ready | ⏳ Unknown | 🔴 Yes |
| Frontend UI | ✅ Complete | ✅ Deployed | ✅ No |
| Cron Job | ✅ Config Ready | ⏳ Unknown | 🟢 No |

---

## 🎯 **GO-LIVE DECISION**

### **✅ READY TO GO LIVE IF:**
- ✅ All 5 critical items are checked
- ✅ End-to-end test passes
- ✅ No errors in logs

### **❌ NOT READY IF:**
- ❌ Any critical item is missing
- ❌ Functions fail when tested
- ❌ Webhook doesn't trigger

---

## 🚀 **ESTIMATED TIME TO GO-LIVE**

**If starting from scratch:**
- Database Migration: 2 minutes
- Deploy Functions: 10 minutes
- Set Secrets: 2 minutes
- Configure Webhook: 2 minutes
- Testing: 10 minutes

**Total: ~25 minutes**

---

## 📝 **POST-LAUNCH MONITORING**

After going live, monitor:
1. Edge Function logs for errors
2. Database for new chat messages
3. User feedback on AI conversations
4. API usage/costs (LOVABLE_API_KEY)

---

**Status:** 🟡 **CODE READY, DEPLOYMENT NEEDS VERIFICATION**

**Next Step:** Verify deployment status and complete missing items.
