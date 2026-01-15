# Post-Migration Checklist

## ✅ Migrations Completed

All database migrations have been successfully applied:
- ✅ RLS policies updated (users can only see their vehicle's alarms)
- ✅ Proactive chat columns added to `vehicle_chat_history`
- ✅ Alarm-to-chat trigger created

---

## Next Steps

### 1. Deploy Edge Function

Deploy the `proactive-alarm-to-chat` edge function:

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy proactive-alarm-to-chat
```

**Or** if using Supabase Dashboard:
1. Go to Edge Functions
2. Create new function: `proactive-alarm-to-chat`
3. Copy contents from `supabase/functions/proactive-alarm-to-chat/index.ts`
4. Deploy

### 2. Verify Environment Variables

The edge function needs these environment variables (check in Supabase Dashboard → Edge Functions → Settings):
- `LOVABLE_API_KEY` ✅ (should already be set)
- `SUPABASE_URL` ✅ (should already be set)
- `SUPABASE_SERVICE_ROLE_KEY` ✅ (should already be set)

### 3. Configure App Settings (if needed)

The trigger function reads Supabase URL and service role key from `app_settings` table. If the trigger isn't working, you may need to add these:

```sql
-- Check if settings exist
SELECT * FROM app_settings WHERE key IN ('supabase_url', 'supabase_service_role_key');

-- If they don't exist, add them (replace with your actual values)
INSERT INTO app_settings (key, value) VALUES
  ('supabase_url', 'https://YOUR_PROJECT.supabase.co'),
  ('supabase_service_role_key', 'YOUR_SERVICE_ROLE_KEY')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

**Note**: If you're using Supabase, you can also hardcode these in the trigger function instead of reading from `app_settings`.

---

## Testing

### Test 1: RLS Policies (Security)

1. **Login as regular user:**
   - Should only see alarms for assigned vehicles
   - Should NOT see alarms for other users' vehicles

2. **Login as admin:**
   - Should see ALL alarms from ALL vehicles

### Test 2: Proactive Chat Integration

1. **Create a test alarm** (or wait for a real one):
   ```sql
   -- Insert a test alarm (replace device_id with your vehicle)
   INSERT INTO proactive_vehicle_events (device_id, event_type, severity, title, message)
   VALUES ('YOUR_DEVICE_ID', 'low_battery', 'warning', 'Low Battery', 'Battery is below 20%');
   ```

2. **Check vehicle chat:**
   - Go to the vehicle's chat page
   - Should see a proactive message from the AI
   - Message should use vehicle's personality and language

3. **Check edge function logs:**
   - Go to Supabase Dashboard → Edge Functions → proactive-alarm-to-chat → Logs
   - Should see successful execution

### Test 3: Notification Filtering

1. **Check notification banner:**
   - Should only show alarms for your assigned vehicles
   - Styling should match PWA neumorphic design

2. **Check GlobalAlertListener:**
   - Should only trigger for your vehicle's alarms
   - Should play sounds/show toasts based on preferences

---

## Troubleshooting

### Trigger not firing?

1. **Check if trigger exists:**
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'trigger_alarm_to_chat';
   ```

2. **Check function exists:**
   ```sql
   SELECT * FROM pg_proc WHERE proname = 'notify_alarm_to_chat';
   ```

3. **Check app_settings:**
   ```sql
   SELECT * FROM app_settings WHERE key IN ('supabase_url', 'supabase_service_role_key');
   ```

### Edge function not being called?

1. **Check edge function is deployed:**
   - Go to Supabase Dashboard → Edge Functions
   - Verify `proactive-alarm-to-chat` exists

2. **Check function logs:**
   - Look for errors in edge function logs
   - Check if function is receiving requests

3. **Check trigger logs:**
   ```sql
   -- Enable logging to see trigger execution
   SET log_min_messages TO 'warning';
   ```

### Alarms not appearing in chat?

1. **Check if message was inserted:**
   ```sql
   SELECT * FROM vehicle_chat_history 
   WHERE is_proactive = true 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

2. **Check edge function logs:**
   - Look for errors in function execution
   - Check if LLM API is working

3. **Verify vehicle assignments:**
   ```sql
   SELECT * FROM vehicle_assignments WHERE device_id = 'YOUR_DEVICE_ID';
   ```

---

## Success Indicators

✅ **Migrations Applied:**
- RLS policies updated
- Chat columns added
- Trigger created

✅ **Edge Function Deployed:**
- Function exists in Supabase
- Environment variables set
- Function logs show activity

✅ **System Working:**
- Alarms appear in chat automatically
- Users only see their vehicle's alarms
- Proactive messages use correct personality/language
- Notifications filtered correctly

---

## What's Next?

Once everything is working:

1. **Monitor edge function logs** for any errors
2. **Test with real vehicle events** (not just test data)
3. **Verify proactive messages** appear in chat
4. **Check notification filtering** works correctly

The system is now **proactive (Level 4)** and will automatically post alarms to chat via LLM! 🎉
