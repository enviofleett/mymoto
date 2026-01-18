# Testing AI Chat Preferences Implementation

## Overview
This guide helps you test that the granular AI chat preferences are working correctly.

## Pre-Test Checklist

1. **Migration Applied**: Ensure `20260118103411_add_ai_chat_preferences.sql` has been run
2. **Edge Function Deployed**: Ensure `proactive-alarm-to-chat` function is deployed with latest changes
3. **UI Access**: Access the vehicle notification settings page

## Test 1: Database Schema Verification

Run `TEST_AI_CHAT_PREFERENCES.sql` in Supabase SQL Editor:

```sql
-- Check if columns exist
SELECT column_name 
FROM information_schema.columns
WHERE table_name = 'vehicle_notification_preferences'
AND column_name LIKE 'enable_ai_chat_%';
```

**Expected**: Should show all `enable_ai_chat_*` columns (ignition_on, ignition_off, low_battery, critical_battery, etc.)

## Test 2: UI Component Test

1. Navigate to a vehicle's notification settings page
2. Look for each event type (e.g., "Ignition Start", "Overspeeding")
3. **Verify**: Each event should have TWO separate toggles:
   - 📱 **Push Notification** toggle (existing)
   - 💬 **AI Chat Message** toggle (new)

**Expected Behavior**:
- Both toggles work independently
- You can enable push but disable AI chat (or vice versa)
- Settings save successfully

## Test 3: Edge Function Logic Test

### Test Scenario: AI Chat Disabled, Push Enabled

1. Set up a test preference:
   - `ignition_on = true` (push enabled)
   - `enable_ai_chat_ignition_on = false` (AI chat disabled)

2. Trigger an `ignition_on` event (or create test event in `proactive_vehicle_events`)

3. **Expected**: 
   - Push notification should be sent (if push system is enabled)
   - **NO** AI chat message should be created in `vehicle_chat_history`
   - Function should return: `{ success: false, message: 'No users have AI Chat enabled for this event' }`

### Test Scenario: AI Chat Enabled, Push Disabled

1. Set up a test preference:
   - `ignition_on = false` (push disabled)
   - `enable_ai_chat_ignition_on = true` (AI chat enabled)

2. Trigger an `ignition_on` event

3. **Expected**:
   - **NO** push notification should be sent
   - AI chat message **SHOULD** be created in `vehicle_chat_history` with `is_proactive: true`
   - Message should be LLM-generated with vehicle personality

## Test 4: Default Values Test

Check default values for new preferences:

```sql
SELECT 
  enable_ai_chat_critical_battery,
  enable_ai_chat_offline,
  enable_ai_chat_maintenance_due,
  enable_ai_chat_anomaly_detected
FROM vehicle_notification_preferences
LIMIT 1;
```

**Expected**: Critical events should default to `true`, others to `false`

## Test 5: Morning Briefing Function Test

Test the morning briefing function:

```bash
# Call the function directly (requires device_id)
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/morning-briefing' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"device_id": "YOUR_DEVICE_ID"}'
```

**Expected**:
- Function should check `morning_greeting` preference
- Only generate briefing if `morning_greeting = true`
- Briefing should be posted to `vehicle_chat_history`

## Troubleshooting

### Columns Not Found
- **Issue**: `enable_ai_chat_*` columns don't exist
- **Fix**: Run migration `20260118103411_add_ai_chat_preferences.sql`

### UI Shows Only One Toggle
- **Issue**: Old UI still showing single toggle
- **Fix**: 
  - Clear browser cache
  - Verify `VehicleNotificationSettings.tsx` has the updated code
  - Check browser console for errors

### AI Chat Messages Still Created When Disabled
- **Issue**: Function not checking `enable_ai_chat_*` preferences
- **Fix**: 
  - Verify `proactive-alarm-to-chat/index.ts` has the AI chat preference check (lines 417-476)
  - Redeploy the edge function: `supabase functions deploy proactive-alarm-to-chat`

### TypeScript Errors
- **Issue**: Type errors in `VehicleNotificationSettings.tsx`
- **Fix**: 
  - Ensure interface includes `enable_ai_chat_*` properties
  - Run `npm run type-check` to verify types

## Quick Manual Test Steps

1. **Open Notification Settings**: Go to a vehicle's settings page
2. **Find an Event**: Scroll to any event type (e.g., "Ignition Start")
3. **Verify Two Toggles**: Should see "Push Notification" and "AI Chat Message" toggles
4. **Test Independence**: 
   - Enable push, disable AI chat → Save
   - Verify push works, AI chat doesn't
   - Switch: Disable push, enable AI chat → Save
   - Verify AI chat works, push doesn't

## Success Criteria

✅ All `enable_ai_chat_*` columns exist in database  
✅ UI shows two separate toggles per event  
✅ Toggles work independently  
✅ Edge function respects AI chat preferences  
✅ Default values are correct (critical events enabled)  
✅ No TypeScript/linter errors  
