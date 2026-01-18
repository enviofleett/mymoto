# Supabase Database Webhook Setup - Quick Guide

## Why Webhooks?

If `net.http_post` isn't working (likely due to `pg_net` extension issues), **Supabase Database Webhooks** are the recommended solution:

✅ **More Reliable** - Handled by Supabase infrastructure  
✅ **No Extensions Required** - Works out of the box  
✅ **Better Error Handling** - Errors logged in webhook dashboard  
✅ **Retry Mechanism** - Automatic retries for failed calls  
✅ **No Configuration in Code** - Set up once in dashboard  

---

## Step-by-Step Setup

### Step 1: Run SQL to Simplify Trigger

Run `FINAL_DIAGNOSIS_AND_FIX.sql` which will update the trigger function to just fire (webhook handles HTTP call).

### Step 2: Create Webhook in Supabase Dashboard

1. **Go to:** Supabase Dashboard → Database → Webhooks
2. **Click:** "Create a new webhook"
3. **Configure:**
   - **Name:** `proactive-alarm-to-chat-webhook`
   - **Table:** `proactive_vehicle_events`
   - **Events:** Check `INSERT` ✅
   - **Type:** `Edge Function`
   - **Function:** `proactive-alarm-to-chat`
   - **HTTP Method:** `POST`
4. **Click:** "Save"

### Step 3: Verify Edge Function is Deployed

Ensure the edge function exists:

```bash
supabase functions list
```

Should show `proactive-alarm-to-chat` in the list.

### Step 4: Test

Create a test event:

```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message
)
VALUES (
  'TEST_DEVICE_001', 'critical_battery', 'critical', 
  'Webhook Test', 'Testing webhook setup'
);
```

### Step 5: Check Results

**Check Webhook Logs:**
- Dashboard → Database → Webhooks → `proactive-alarm-to-chat-webhook` → Logs
- Should show successful HTTP calls to edge function

**Check Edge Function Logs:**
- Dashboard → Edge Functions → `proactive-alarm-to-chat` → Logs
- Should show function being called and processing events

**Check Database:**
```sql
SELECT notified, notified_at 
FROM proactive_vehicle_events 
WHERE title = 'Webhook Test' 
ORDER BY created_at DESC 
LIMIT 1;
```

Should show `notified = true` after webhook processes the event.

---

## Troubleshooting

### Webhook Not Firing?

1. **Verify trigger exists:**
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'trigger_alarm_to_chat';
   ```

2. **Check webhook configuration:**
   - Table: `proactive_vehicle_events`
   - Events: `INSERT` must be checked
   - Function: `proactive-alarm-to-chat` must exist

### Webhook Firing But Edge Function Not Working?

1. **Check edge function deployment:**
   ```bash
   supabase functions list
   ```

2. **Check edge function logs for errors**

3. **Verify LOVABLE_API_KEY is set in Supabase secrets**

4. **Check edge function code** for issues

### Events Not Being Notified?

1. **Check vehicle assignments exist**
2. **Check AI chat preferences are enabled**
3. **Check edge function logs** for processing errors

---

## Summary

**Current Issue:** `net.http_post` likely failing (pg_net extension issue)

**Solution:** Use Supabase Database Webhooks instead

**Steps:**
1. ✅ Run `FINAL_DIAGNOSIS_AND_FIX.sql`
2. ⏳ Set up webhook in Supabase Dashboard
3. ⏳ Test with new event
4. ⏳ Monitor webhook and edge function logs

---

**Next Action:** Set up the webhook in Supabase Dashboard after running `FINAL_DIAGNOSIS_AND_FIX.sql`
