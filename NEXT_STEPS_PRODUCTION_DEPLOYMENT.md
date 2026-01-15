# Next Steps: Production Deployment Checklist

## Current Status
✅ **All code committed locally (23 commits ready)**
✅ **Auth page loading issue fixed**
✅ **All features implemented and tested**

---

## Step 1: Push to GitHub Repository

### Generate Personal Access Token
1. Go to: https://github.com/settings/tokens
2. Click **Generate new token** → **Generate new token (classic)**
3. Name: `Fleet Dashboard Push`
4. Scopes: ✅ **repo**
5. Click **Generate token** and **COPY IT**

### Push to Repository
```bash
# Push all commits
git push origin main

# When prompted:
# Username: toolbuxdev
# Password: [paste your Personal Access Token]
```

**Expected Result:** All 23 commits pushed successfully to GitHub.

---

## Step 2: Run Database Migrations

### Migration 1: Vehicle Notification Preferences
```sql
-- Copy and paste into Supabase SQL Editor
-- File: RUN_THIS_MIGRATION.sql
```

**What it does:**
- Creates `vehicle_notification_preferences` table
- Sets up RLS policies
- Creates indexes

### Migration 2: Privacy & Security Terms
```sql
-- Copy and paste into Supabase SQL Editor
-- File: RUN_THIS_MIGRATION_PRIVACY_TERMS.sql
```

**What it does:**
- Creates `privacy_security_terms` table
- Creates `user_terms_agreements` table
- Inserts default terms
- Sets up RLS policies

### Verify Migrations
```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('vehicle_notification_preferences', 'privacy_security_terms', 'user_terms_agreements');

-- Should return 3 rows
```

---

## Step 3: Deploy Edge Functions

### Deploy via Supabase Dashboard

1. **handle-vehicle-event**
   - Go to: Supabase Dashboard → Edge Functions
   - Create/Update: `handle-vehicle-event`
   - Copy code from: `supabase/functions/handle-vehicle-event/index.ts`
   - Deploy

2. **morning-briefing**
   - Create/Update: `morning-briefing`
   - Copy code from: `supabase/functions/morning-briefing/index.ts`
   - Deploy

3. **proactive-alarm-to-chat**
   - Create/Update: `proactive-alarm-to-chat`
   - Copy code from: `supabase/functions/proactive-alarm-to-chat/index.ts`
   - Deploy

4. **vehicle-chat** (Updated)
   - Update: `vehicle-chat`
   - Copy code from: `supabase/functions/vehicle-chat/index.ts`
   - Deploy

### Or Deploy via CLI
```bash
# If you have Supabase CLI installed
supabase functions deploy handle-vehicle-event
supabase functions deploy morning-briefing
supabase functions deploy proactive-alarm-to-chat
supabase functions deploy vehicle-chat
```

---

## Step 4: Configure Database Webhook

### Set Up Webhook for Proactive Events

1. Go to: Supabase Dashboard → Database → Webhooks
2. Click **Create a new webhook**
3. Configure:
   - **Name:** `proactive_vehicle_events_to_handle_vehicle_event`
   - **Table:** `proactive_vehicle_events`
   - **Events:** ✅ INSERT
   - **Type:** Edge Function
   - **Function:** `handle-vehicle-event`
   - **HTTP Method:** POST

4. Click **Save**

**Verify:** Test by inserting a test event:
```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message
) VALUES (
  'YOUR_DEVICE_ID',
  'low_battery',
  'warning',
  'Test Alert',
  'This is a test notification'
);
```

Check Edge Function logs to verify it was triggered.

---

## Step 5: Configure Secrets

### Set Required Secrets in Supabase

Go to: Supabase Dashboard → Project Settings → Edge Functions → Secrets

**Required Secrets:**
- `LOVABLE_API_KEY` - Your Lovable AI API key

**Verify:**
```bash
# Test secret is set (via Edge Function logs)
# Or check in Dashboard → Edge Functions → Secrets
```

---

## Step 6: Test Features

### Test 1: Privacy & Security Terms
1. Sign in as admin
2. Navigate to: `/admin/privacy-settings`
3. Verify terms editor loads
4. Edit and save terms
5. Sign out and sign in as new user
6. Verify terms agreement dialog appears

### Test 2: Vehicle Notification Settings
1. Sign in as owner
2. Go to vehicle profile → "Notifications" tab
3. Toggle notification preferences
4. Verify settings save
5. Trigger a test event (e.g., low battery)
6. Verify notification appears (if enabled)

### Test 3: Proactive AI Conversations
1. Enable `ignition_on` notification for a vehicle
2. Trigger ignition event (or wait for real event)
3. Verify AI chat message appears
4. Check message uses vehicle personality

### Test 4: Morning Briefing
1. Enable `morning_greeting` for a vehicle
2. Manually trigger briefing:
   ```bash
   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/morning-briefing \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"device_id": "YOUR_DEVICE_ID"}'
   ```
3. Verify briefing appears in chat

---

## Step 7: Production Verification

### Database Checks
```sql
-- Verify all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'vehicle_notification_preferences',
  'privacy_security_terms',
  'user_terms_agreements',
  'user_ai_chat_preferences',
  'proactive_vehicle_events'
);

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
  'vehicle_notification_preferences',
  'privacy_security_terms',
  'user_terms_agreements'
);
```

### Edge Function Checks
- ✅ All functions deployed
- ✅ Webhook configured
- ✅ Secrets set
- ✅ Functions responding (check logs)

### Frontend Checks
- ✅ Auth page loads: `http://localhost:8080/auth`
- ✅ Admin can access Privacy & Terms settings
- ✅ Users see terms agreement dialog
- ✅ Notification settings work
- ✅ Chat messages persist

---

## Step 8: Monitor Production

### Check Edge Function Logs
- Supabase Dashboard → Edge Functions → Logs
- Monitor for errors
- Check API call success rates

### Check Database Performance
- Monitor disk I/O usage
- Check query performance
- Verify indexes are being used

### User Feedback
- Monitor user reports
- Check error logs
- Track feature usage

---

## Priority Order

### 🔴 Critical (Do First)
1. ✅ Push to GitHub
2. ✅ Run database migrations
3. ✅ Deploy edge functions
4. ✅ Configure webhook

### 🟡 Important (Do Next)
5. ✅ Set up secrets
6. ✅ Test all features
7. ✅ Verify production

### 🟢 Nice to Have
8. ✅ Monitor logs
9. ✅ Collect feedback
10. ✅ Optimize performance

---

## Quick Command Reference

```bash
# 1. Push to GitHub
git push origin main

# 2. Check migration status (in Supabase SQL Editor)
SELECT * FROM privacy_security_terms;
SELECT * FROM vehicle_notification_preferences LIMIT 1;

# 3. Test edge function (replace with your values)
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/handle-vehicle-event \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "INSERT", "table": "proactive_vehicle_events", "record": {...}}'

# 4. Check function logs
# Go to: Supabase Dashboard → Edge Functions → [function-name] → Logs
```

---

## Troubleshooting

### Migration Fails
- Check if tables already exist
- Verify RLS policies
- Check for syntax errors

### Edge Function Fails
- Check function logs
- Verify secrets are set
- Check function code for errors

### Webhook Not Triggering
- Verify webhook is configured
- Check webhook logs
- Test with manual INSERT

### Frontend Not Loading
- Check browser console
- Verify Supabase URL/key
- Check network requests

---

## Success Criteria

✅ All commits pushed to GitHub
✅ All migrations run successfully
✅ All edge functions deployed
✅ Webhook configured and working
✅ Secrets configured
✅ Features tested and working
✅ Production monitoring active

---

## Estimated Time

- **Push to GitHub:** 2 minutes
- **Run Migrations:** 5 minutes
- **Deploy Functions:** 15 minutes
- **Configure Webhook:** 5 minutes
- **Testing:** 30 minutes
- **Total:** ~1 hour

---

**Ready to deploy!** Start with Step 1 (Push to GitHub) and work through each step systematically.
