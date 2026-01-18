# Testing UI Component and Edge Function

## Test 1: UI Component Verification

### Step 1: Navigate to Vehicle Settings

1. Open your application (localhost or deployed)
2. Navigate to any vehicle's settings/notification preferences page
3. Look for the notification settings section

### Step 2: Verify Two Toggles Per Event

For each event type (e.g., "Ignition Start", "Overspeeding", "Critical Battery"), you should see:

**Expected Layout:**
```
┌─────────────────────────────────────────┐
│ 🔌 Ignition Start                      │
│ Vehicle engine starts                  │
│                                         │
│   📱 Push Notification        [ON/OFF]  │
│   💬 AI Chat Message         [ON/OFF]  │
└─────────────────────────────────────────┘
```

**Checklist:**
- [ ] Each event has **two separate toggles**
- [ ] Push Notification toggle has a 📱 (Bell) icon
- [ ] AI Chat Message toggle has a 💬 (MessageSquare) icon
- [ ] Toggles work independently
- [ ] Settings save successfully (check console for errors)

### Step 3: Test Independent Control

**Test Case 1: Enable Push, Disable AI Chat**
1. Find "Ignition Start" event
2. Enable "Push Notification" toggle
3. Disable "AI Chat Message" toggle
4. Save
5. **Expected**: Push enabled, AI chat disabled in database

**Test Case 2: Disable Push, Enable AI Chat**
1. Find "Overspeeding" event
2. Disable "Push Notification" toggle
3. Enable "AI Chat Message" toggle
4. Save
5. **Expected**: Push disabled, AI chat enabled in database

**Verify in Database:**
```sql
SELECT 
  device_id,
  ignition_on as push_ignition,
  enable_ai_chat_ignition_on as ai_chat_ignition,
  overspeeding as push_overspeeding,
  enable_ai_chat_overspeeding as ai_chat_overspeeding
FROM vehicle_notification_preferences
WHERE device_id = 'YOUR_DEVICE_ID';
```

### Step 4: Verify Default Values Display Correctly

Check that critical events show AI Chat enabled by default:
- Critical Battery: AI Chat should be ON (default)
- Offline: AI Chat should be ON (default)
- Maintenance Due: AI Chat should be ON (default)
- Anomaly Detected: AI Chat should be ON (default)

---

## Test 2: Edge Function Testing

### Step 1: Deploy Updated Edge Function

```bash
# Deploy the updated proactive-alarm-to-chat function
supabase functions deploy proactive-alarm-to-chat

# Or if using Supabase CLI with project:
supabase functions deploy proactive-alarm-to-chat --project-ref YOUR_PROJECT_REF
```

### Step 2: Test Scenario A: AI Chat Disabled, Push Enabled

**Setup:**
1. Set preferences for a test device:
```sql
UPDATE vehicle_notification_preferences
SET 
  ignition_on = true,              -- Push enabled
  enable_ai_chat_ignition_on = false  -- AI Chat disabled
WHERE device_id = 'YOUR_DEVICE_ID'
  AND user_id = 'YOUR_USER_ID';
```

2. Create a test event (or trigger ignition_on event):
```sql
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message,
  metadata
) VALUES (
  'YOUR_DEVICE_ID',
  'ignition_on',
  'info',
  'Ignition Started',
  'Vehicle engine has been started',
  '{}'::jsonb
);
```

**Expected Result:**
- ✅ Push notification sent (if push system is enabled)
- ❌ **NO** AI chat message created in `vehicle_chat_history`
- Function logs: `"No users have AI Chat enabled for ignition_on"`

**Verify:**
```sql
-- Should return 0 rows (no AI chat message)
SELECT * FROM vehicle_chat_history
WHERE device_id = 'YOUR_DEVICE_ID'
  AND is_proactive = true
  AND content LIKE '%ignition%'
  AND created_at > now() - INTERVAL '5 minutes';
```

### Step 3: Test Scenario B: AI Chat Enabled, Push Disabled

**Setup:**
1. Set preferences:
```sql
UPDATE vehicle_notification_preferences
SET 
  ignition_on = false,              -- Push disabled
  enable_ai_chat_ignition_on = true  -- AI Chat enabled
WHERE device_id = 'YOUR_DEVICE_ID'
  AND user_id = 'YOUR_USER_ID';
```

2. Create same test event as above

**Expected Result:**
- ❌ **NO** push notification sent
- ✅ AI chat message **SHOULD** be created in `vehicle_chat_history`
- Message should have `is_proactive: true`
- Message should be LLM-generated with vehicle personality

**Verify:**
```sql
-- Should return 1+ rows (AI chat message created)
SELECT 
  id,
  device_id,
  user_id,
  role,
  content,
  is_proactive,
  created_at
FROM vehicle_chat_history
WHERE device_id = 'YOUR_DEVICE_ID'
  AND is_proactive = true
  AND role = 'assistant'
  AND created_at > now() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 1;
```

### Step 4: Test Scenario C: Both Enabled

**Setup:**
```sql
UPDATE vehicle_notification_preferences
SET 
  ignition_on = true,               -- Push enabled
  enable_ai_chat_ignition_on = true  -- AI Chat enabled
WHERE device_id = 'YOUR_DEVICE_ID';
```

**Expected Result:**
- ✅ Push notification sent
- ✅ AI chat message created

### Step 5: Check Edge Function Logs

View function execution logs:
1. Go to Supabase Dashboard → Edge Functions → `proactive-alarm-to-chat`
2. Check "Logs" tab
3. Look for:
   - `"No users have AI Chat enabled for [event_type]"`
   - `"Successfully posted proactive message"`
   - `"AI Chat enabled for [X] user(s)"`

---

## Test 3: Critical Events Default Behavior

Test that critical events work with default values (when preferences don't exist):

**Setup:**
```sql
-- Create a device preference without explicitly setting AI chat for critical events
INSERT INTO vehicle_notification_preferences (
  user_id,
  device_id,
  critical_battery,
  enable_ai_chat_critical_battery  -- Leave NULL (default will apply)
) VALUES (
  'YOUR_USER_ID',
  'YOUR_DEVICE_ID',
  true,  -- Push enabled
  NULL   -- AI Chat will default to true (migration sets this)
) ON CONFLICT (user_id, device_id) DO NOTHING;
```

**Create critical event:**
```sql
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message
) VALUES (
  'YOUR_DEVICE_ID',
  'critical_battery',
  'critical',
  'Critical Battery Alert',
  'Battery level is critically low'
);
```

**Expected:**
- ✅ AI chat message created (defaults to true for critical events)
- Function uses default: `enable_ai_chat_critical_battery = true`

---

## Troubleshooting

### UI Not Showing Two Toggles

**Check:**
1. Browser cache cleared?
2. Component file updated? (`VehicleNotificationSettings.tsx`)
3. TypeScript errors? Check console
4. Are you on the correct settings page?

**Fix:**
```bash
# Clear cache and rebuild
npm run build
# Or restart dev server
npm run dev
```

### Edge Function Not Respecting Preferences

**Check:**
1. Function deployed with latest code?
2. Function logs show preference check?
3. Database has correct preference values?

**Verify Function Code:**
Check `supabase/functions/proactive-alarm-to-chat/index.ts` lines 417-476 should have AI chat preference check.

### Preferences Not Saving

**Check:**
1. RLS policies allow updates?
2. User has permission?
3. Network errors in browser console?

**Debug:**
```sql
-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'vehicle_notification_preferences';

-- Test direct update
UPDATE vehicle_notification_preferences
SET enable_ai_chat_ignition_on = true
WHERE device_id = 'YOUR_DEVICE_ID'
  AND user_id = 'YOUR_USER_ID'
RETURNING *;
```

---

## Success Criteria

✅ UI shows two toggles per event  
✅ Toggles work independently  
✅ Settings save correctly  
✅ Edge function checks `enable_ai_chat_*` preferences  
✅ AI chat messages only created when `enable_ai_chat_* = true`  
✅ Critical events default to AI chat enabled  
✅ Function logs show correct preference checks  
