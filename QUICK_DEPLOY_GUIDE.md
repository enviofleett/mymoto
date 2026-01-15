# Quick Deploy Guide - Proactive Alarm System

## Step 1: Run Database Migrations

### Option A: Using Supabase SQL Editor (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Open the file `DEPLOY_MIGRATIONS.sql`
4. **Copy the entire contents** (not the filename!)
5. Paste into the SQL Editor
6. Click **Run**

### Option B: If you get errors about `net` extension

If Migration 3 fails with an error about `net` extension:

1. Run only Migrations 1 and 2 from `DEPLOY_MIGRATIONS.sql`
2. Then use `DEPLOY_MIGRATIONS_ALTERNATIVE.sql` for Migration 3
3. Set up a Supabase webhook (see instructions in the alternative file)

---

## Step 2: Deploy Edge Function

```bash
# Make sure you're in the project root
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Deploy the proactive-alarm-to-chat function
supabase functions deploy proactive-alarm-to-chat
```

**Or** if using Supabase CLI:
```bash
supabase functions deploy proactive-alarm-to-chat --project-ref YOUR_PROJECT_REF
```

---

## Step 3: Verify Environment Variables

The edge function needs these environment variables (should already be set):
- `LOVABLE_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Check in Supabase Dashboard → Edge Functions → proactive-alarm-to-chat → Settings

---

## Step 4: Test

1. **Test RLS Policies:**
   - Login as a regular user
   - You should only see alarms for your assigned vehicles
   - Login as admin → should see all alarms

2. **Test Proactive Chat:**
   - Create a test alarm (or wait for a real one)
   - Check the vehicle's chat → should see proactive message
   - Message should use vehicle's personality and language

3. **Test Notifications:**
   - Notification banner should only show your vehicle's alarms
   - Styling should match PWA neumorphic design

---

## Troubleshooting

### Error: "net extension not found"
- Use `DEPLOY_MIGRATIONS_ALTERNATIVE.sql` instead
- Set up Supabase webhook (see alternative file for instructions)

### Error: "function notify_alarm_to_chat does not exist"
- Make sure you ran Migration 3
- Check if `net` extension is enabled in your Supabase project

### Alarms not appearing in chat
- Check edge function logs in Supabase Dashboard
- Verify the trigger is firing (check database logs)
- Make sure `proactive-alarm-to-chat` function is deployed

### Users seeing all alarms
- Verify Migration 1 ran successfully
- Check RLS policies in Supabase Dashboard → Database → Policies
- Test with a non-admin user

---

## What Each Migration Does

### Migration 1: Fix RLS Policies
- **Purpose**: Security fix - users only see their vehicle's alarms
- **Impact**: Privacy protection, prevents data leakage

### Migration 2: Add Proactive Chat Columns
- **Purpose**: Add `is_proactive` and `alert_id` columns to chat history
- **Impact**: Enables tracking of proactive messages

### Migration 3: Create Alarm-to-Chat Trigger
- **Purpose**: Automatically post alarms to chat via LLM
- **Impact**: Proactive AI notifications in chat

---

## Files Created

- ✅ `DEPLOY_MIGRATIONS.sql` - All migrations in one file
- ✅ `DEPLOY_MIGRATIONS_ALTERNATIVE.sql` - Alternative if net extension unavailable
- ✅ `supabase/functions/proactive-alarm-to-chat/index.ts` - Edge function
- ✅ Updated notification components with filtering and neumorphic styling

---

## Next Steps After Deployment

1. Monitor edge function logs for errors
2. Test with real vehicle events
3. Verify proactive messages appear in chat
4. Check notification filtering works correctly
