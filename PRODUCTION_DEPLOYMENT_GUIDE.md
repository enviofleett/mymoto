# 🚀 PRODUCTION DEPLOYMENT GUIDE
## Complete Step-by-Step Deployment Process

**Date**: 2026-01-19  
**Status**: Ready for Production Deployment  
**Estimated Time**: 30-45 minutes

---

## 📋 **PRE-DEPLOYMENT CHECKLIST**

Before starting deployment, ensure you have:

- [ ] ✅ Supabase Dashboard access
- [ ] ✅ Supabase CLI installed (`supabase --version`)
- [ ] ✅ Service Role Key (from Settings > API > service_role)
- [ ] ✅ Project URL: `https://cmvpnsqiefbsqkwnraka.supabase.co`

---

## 🎯 **STEP 1: Verify Current State** (5 minutes)

### **1.1: Run Migration Status Check**

**Open**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new

**Run**: Copy and paste contents of `verify_migration_status.sql`

**Check Results**:
- ✅ Critical migrations should show "EXISTS"
- ⚠️ Optional migrations are nice-to-have
- ✅ Cron job should show status

---

## 🔧 **STEP 2: Apply Missing Migrations** (10 minutes)

### **2.1: Critical Migrations** (Must Apply)

**If any are missing, apply in order**:

1. **Retry Support**: `supabase/migrations/20260118000002_add_retry_support.sql`
2. **Deduplication Fix**: `supabase/migrations/20260118000001_fix_alarm_to_chat_deduplication.sql`
3. **Proactive Chat Columns**: `supabase/migrations/20260114000005_add_proactive_chat_columns.sql`
4. **Trigger Setup**: `supabase/migrations/20260114000004_trigger_alarm_to_chat.sql`

**How to Apply**:
1. Open each SQL file
2. Copy contents
3. Paste in Supabase SQL Editor
4. Click "Run"

---

## ⚙️ **STEP 3: Configure Database Settings** (2 minutes)

### **3.1: Set Supabase URL and Service Role Key**

**Run in SQL Editor**:

```sql
-- Set Supabase URL
ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://cmvpnsqiefbsqkwnraka.supabase.co';

-- Set service role key (get from: Settings > API > service_role)
ALTER DATABASE postgres SET "app.settings.supabase_service_role_key" = 'YOUR_SERVICE_ROLE_KEY_HERE';
```

**Get Service Role Key**:
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/settings/api
2. Copy "service_role" key (secret)
3. Paste in SQL above

---

## 🚀 **STEP 4: Deploy Edge Functions** (10 minutes)

### **4.1: Deploy via Supabase CLI** (Recommended)

```bash
# Navigate to project root
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Deploy critical edge functions
supabase functions deploy proactive-alarm-to-chat --no-verify-jwt
supabase functions deploy retry-failed-notifications --no-verify-jwt
supabase functions deploy sync-trips-incremental --no-verify-jwt
```

### **4.2: Deploy via Supabase Dashboard** (Alternative)

**Go to**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions

**For each function**:
1. Click function name
2. Click "Deploy" button
3. Wait for deployment to complete

**Required Functions**:
- ✅ `proactive-alarm-to-chat`
- ✅ `retry-failed-notifications`
- ✅ `sync-trips-incremental`

---

## ⏰ **STEP 5: Set Up Retry Cron Job** (5 minutes)

### **5.1: Apply Cron Job Migration**

**Run in SQL Editor**:

```sql
-- Copy and paste contents of:
-- supabase/migrations/20260119000005_setup_retry_notifications_cron.sql
```

**Or run manually**:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule retry job
SELECT cron.schedule(
  'retry-failed-notifications-15min',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/retry-failed-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := jsonb_build_object()
    ) AS request_id;
  $$
);
```

### **5.2: Verify Cron Job**

```sql
-- Check if cron job is scheduled
SELECT 
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobname = 'retry-failed-notifications-15min';
```

**Expected**: Should show 1 row with `active = true`

---

## ✅ **STEP 6: Run Verification Tests** (10 minutes)

### **6.1: Test Proactive Notification**

**Create test event**:
```sql
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message
) VALUES (
  'YOUR_DEVICE_ID',  -- Replace with actual device ID
  'low_battery',
  'warning',
  'Test Notification',
  'This is a test notification'
);
```

**Check results**:
```sql
-- Check if chat message was created
SELECT * FROM vehicle_chat_history 
WHERE is_proactive = true 
ORDER BY created_at DESC 
LIMIT 1;

-- Check if event was marked as notified
SELECT id, notified, notified_at 
FROM proactive_vehicle_events 
ORDER BY created_at DESC 
LIMIT 1;
```

**Expected**:
- ✅ Chat message with `is_proactive = true`
- ✅ Event with `notified = true`

### **6.2: Test Retry Function**

**Via curl**:
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/retry-failed-notifications' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

**Expected**: JSON response with `success: true`

---

## 📊 **STEP 7: Monitor Deployment** (24 hours)

### **7.1: Monitor Edge Function Logs**

```bash
# Watch proactive-alarm-to-chat logs
supabase functions logs proactive-alarm-to-chat --tail 50

# Watch retry-failed-notifications logs
supabase functions logs retry-failed-notifications --tail 50
```

### **7.2: Monitor Database Metrics**

**Run daily**:
```sql
-- Check failed events count
SELECT 
  COUNT(*) as total_errors,
  COUNT(*) FILTER (WHERE resolved = false) as unresolved,
  COUNT(*) FILTER (WHERE retry_count >= 3) as max_retries_reached
FROM edge_function_errors;

-- Check notification success rate
SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE notified = true) as notified_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE notified = true) / COUNT(*), 2) as success_rate_percent
FROM proactive_vehicle_events
WHERE created_at >= now() - INTERVAL '24 hours';

-- Check cron job execution
SELECT 
  jobname,
  COUNT(*) as execution_count,
  COUNT(*) FILTER (WHERE status = 'succeeded') as success_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failure_count
FROM cron.job_run_details
WHERE jobname = 'retry-failed-notifications-15min'
  AND start_time >= now() - INTERVAL '24 hours'
GROUP BY jobname;
```

---

## 🎉 **DEPLOYMENT COMPLETE**

**Status**: ✅ **PRODUCTION READY**

After completing all steps:
- ✅ All migrations applied
- ✅ Edge functions deployed
- ✅ Cron jobs configured
- ✅ Database settings configured
- ✅ Verification tests passed

**Next Actions**:
1. Monitor logs for 24 hours
2. Watch for any errors
3. Review metrics daily
4. Adjust retry intervals if needed

---

## 🔗 **QUICK REFERENCE LINKS**

### **Dashboard Links**:
- **SQL Editor**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new
- **Edge Functions**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
- **Settings/API**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/settings/api

### **Documentation**:
- **Migration Status**: `verify_migration_status.sql`
- **Verification Checklist**: `DEPLOYMENT_VERIFICATION_CHECKLIST.md`
- **Comprehensive Audit**: `COMPREHENSIVE_PRODUCTION_AUDIT.md`

---

## 🆘 **TROUBLESHOOTING**

### **Issue: Cron Job Not Running**

**Solution**:
```sql
-- Check if cron job exists and is active
SELECT * FROM cron.job WHERE jobname = 'retry-failed-notifications-15min';

-- If missing, recreate it (see Step 5.1)
```

### **Issue: Edge Function Errors**

**Check**:
1. Verify service role key is set correctly
2. Check edge function logs
3. Verify function is deployed
4. Check `edge_function_errors` table

### **Issue: Notifications Not Working**

**Check**:
1. Verify trigger is active (see `DEPLOYMENT_VERIFICATION_CHECKLIST.md`)
2. Check if `proactive_vehicle_events` table exists
3. Verify edge function is deployed
4. Check database settings are configured

---

**Total Deployment Time**: ~30-45 minutes  
**Production Status**: ✅ **READY**
