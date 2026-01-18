# Complete Debugging Guide - Proactive Alarm-to-Chat
**Issue:** Events not being notified (`notified = false`)

---

## 🔍 Current Status

**What we know:**
- ✅ Configuration: Set in `app_settings`
- ✅ Trigger function: Simplified for webhook use
- ✅ Trigger: Exists and enabled
- ✅ Vehicle setup: Complete
- ✅ AI chat preferences: Enabled
- ❌ **Events not being notified**

---

## 🔍 Possible Issues

### Issue 1: `notified` Column Missing ⚠️ **LIKELY**

**Symptom:** `notified = false` but edge function might be working

**Check:**
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'proactive_vehicle_events' 
  AND column_name = 'notified';
```

**If missing:**
- Run `ADD_NOTIFIED_COLUMN.sql` to add the column
- This allows the edge function to mark events as notified

**If exists:**
- The edge function might be failing silently
- Check edge function logs

---

### Issue 2: Webhook Not Configured or Not Firing ⚠️ **LIKELY**

**Symptom:** No edge function logs showing

**Check:**
1. **Verify webhook exists:**
   - Dashboard → Database → Webhooks
   - Look for `proactive-alarm-to-chat-webhook`

2. **Check webhook logs:**
   - Dashboard → Database → Webhooks → [webhook name] → Logs
   - Should show HTTP calls to edge function

3. **If no logs:**
   - Webhook not configured → Set up in Dashboard
   - Webhook not firing → Check trigger exists

---

### Issue 3: Edge Function Not Deployed ⚠️ **POSSIBLE**

**Symptom:** Webhook fires but edge function not found

**Check:**
```bash
supabase functions list
```

**Fix:**
```bash
supabase functions deploy proactive-alarm-to-chat
```

---

### Issue 4: Edge Function Failing ⚠️ **POSSIBLE**

**Symptom:** Edge function logs show errors

**Check:**
- Dashboard → Edge Functions → `proactive-alarm-to-chat` → Logs
- Look for errors or warnings

**Common errors:**
- `LOVABLE_API_KEY` not set → Set in secrets
- Vehicle assignments missing → Create assignments
- AI chat preferences disabled → Enable preferences

---

### Issue 5: No Vehicle Assignments ⚠️ **POSSIBLE**

**Symptom:** Edge function runs but no chat messages created

**Check:**
```sql
SELECT COUNT(*) 
FROM vehicle_assignments 
WHERE device_id = 'TEST_DEVICE_001';
```

**Fix:**
- Create vehicle assignments for TEST_DEVICE_001

---

## 📋 Step-by-Step Debugging

### Step 1: Run Debug Queries

Run `DEBUG_WEBHOOK_ISSUE.sql` to check:
- Trigger and function exist
- `notified` column exists
- Vehicle assignments exist
- AI chat preferences enabled

### Step 2: Add Missing Columns (if needed)

Run `ADD_NOTIFIED_COLUMN.sql` if `notified` column is missing.

### Step 3: Check Webhook Configuration

Verify in Supabase Dashboard:
- Webhook exists
- Webhook is enabled
- Table: `proactive_vehicle_events`
- Events: `INSERT` ✅
- Function: `proactive-alarm-to-chat`

### Step 4: Check Edge Function Logs

Check logs in Dashboard:
- Should show function being called
- Should show processing steps
- Should show success or errors

### Step 5: Test After Each Fix

After each fix, create a new test event and check if `notified = true`.

---

## 🎯 Quick Fix Sequence

1. **Run `DEBUG_WEBHOOK_ISSUE.sql`** - See what's missing
2. **Run `ADD_NOTIFIED_COLUMN.sql`** - Add `notified` column if missing
3. **Verify webhook configured** - Check in Dashboard
4. **Check edge function logs** - Look for errors
5. **Test with new event** - Create event and check results

---

## ✅ Expected Final State

When everything is working:
- ✅ `notified` column exists
- ✅ Webhook configured and firing
- ✅ Edge function deployed and working
- ✅ `LOVABLE_API_KEY` set
- ✅ Vehicle assignments exist
- ✅ AI chat preferences enabled
- ✅ Events marked as `notified = true`
- ✅ Chat messages created

---

**Next Action:** Run `DEBUG_WEBHOOK_ISSUE.sql` to identify what's missing
