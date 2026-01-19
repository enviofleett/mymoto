# Quick Command Log Test

If you got "No rows returned", follow these steps:

## Step 1: Verify Command Was Actually Sent

1. **Open Browser DevTools** (F12) → Network tab
2. **Click "Immobilize" or "Mobilize" button** in the UI
3. **Confirm in the dialog**
4. **Check Network tab** for request to `execute-vehicle-command`
5. **Check Response** - Should be JSON with `success: true` and `command_id`

If the request failed (4xx or 5xx), the command wasn't logged.

## Step 2: Check Without Device Filter

Run this query in Supabase SQL Editor to see ALL commands:

```sql
SELECT * FROM vehicle_command_logs
ORDER BY created_at DESC
LIMIT 10;
```

**If this returns rows:**
- Your device_id filter was wrong
- Run Query 10 from `DEBUG_COMMAND_LOGS.sql` to find correct device_id

**If this returns no rows:**
- Commands aren't being logged at all
- Check Edge Function logs (Step 3)

## Step 3: Check Edge Function Logs

1. **Supabase Dashboard** → Edge Functions → `execute-vehicle-command`
2. **Click "Logs" tab**
3. **Try executing a command** from UI
4. **Look for these log messages:**
   - `[Command] Received: immobilize_engine for device: ...`
   - `[Command] Logged command ... with status: ...`
   - `[Command] Execution complete ... SUCCESS`

**If you DON'T see "[Command] Received":**
- Request never reached Edge Function
- Check Network tab for failed request
- Check CORS errors

**If you see "[Command] Received" but NOT "[Command] Logged command":**
- INSERT failed (check for error after "Received")
- Could be RLS policy issue or table missing

**If you see "Failed to log command":**
- Check the error message - likely RLS or table structure issue

## Step 4: Verify Table Exists

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'vehicle_command_logs'
);
```

Should return `true`. If `false`, migration wasn't applied.

## Step 5: Check Your Device ID

```sql
-- Find your device_id
SELECT device_id, device_name 
FROM vehicles 
ORDER BY last_update DESC;
```

Use the `device_id` from results in your query:

```sql
SELECT * FROM vehicle_command_logs
WHERE device_id = 'ACTUAL_DEVICE_ID_HERE'  -- Use device_id from above
ORDER BY created_at DESC;
```

## Quick Diagnostic Checklist

- [ ] Command button clicked and confirmed?
- [ ] Network request shows `200 OK`?
- [ ] Edge Function logs show "[Command] Received"?
- [ ] Edge Function logs show "[Command] Logged command"?
- [ ] Table `vehicle_command_logs` exists?
- [ ] Using correct `device_id` in query?
- [ ] No RLS policy blocking SELECT?

If all checked ✅ but still no rows, the Edge Function might be failing silently. Check the full logs for any error messages.
