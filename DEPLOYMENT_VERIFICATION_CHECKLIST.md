# 🚀 PRODUCTION DEPLOYMENT VERIFICATION CHECKLIST

**Date**: 2026-01-19  
**Status**: Pre-Deployment Verification  
**Purpose**: Verify all critical components are deployed and configured correctly

---

## 📋 **PRE-DEPLOYMENT CHECKS**

### **Step 1: Verify Database Migrations Applied** ✅

**Run in Supabase SQL Editor**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new

```sql
-- Check critical migrations
SELECT 
  'edge_function_errors table' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'edge_function_errors') 
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration 20260118000002_add_retry_support.sql'
  END as status
UNION ALL
SELECT 
  'proactive_vehicle_events.notified column',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND column_name = 'notified'
    ) 
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Column may not exist (non-critical, handled in code)'
  END
UNION ALL
SELECT 
  'vehicle_chat_history.is_proactive column',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'vehicle_chat_history' 
      AND column_name = 'is_proactive'
    ) 
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration 20260114000005_add_proactive_chat_columns.sql'
  END
UNION ALL
SELECT 
  'trip_sync_status table',
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trip_sync_status') 
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration 20260113180000_trip_sync_status.sql'
  END;
```

**Expected**: All checks should show ✅ EXISTS

---

### **Step 2: Verify Edge Functions Deployed** ✅

**Check in Supabase Dashboard**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions

**Required Edge Functions**:
- [ ] ✅ `proactive-alarm-to-chat` - **CRITICAL**
- [ ] ✅ `retry-failed-notifications` - **RECOMMENDED**
- [ ] ✅ `sync-trips-incremental` - **CRITICAL**
- [ ] ✅ `check-geofences` - **OPTIONAL**
- [ ] ✅ `gps-data` - **CRITICAL**

**Manual Verification**:
```bash
# Check if edge functions are accessible
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/proactive-alarm-to-chat' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"event": {"device_id": "test"}}'
```

**Expected**: Functions should return responses (may error on invalid data, but should respond)

---

### **Step 3: Verify Database Settings** ✅

**Run in Supabase SQL Editor**:

```sql
-- Check if Supabase URL and service role key are configured
SELECT 
  name,
  setting,
  CASE 
    WHEN name = 'app.settings.supabase_url' AND setting IS NOT NULL THEN '✅ CONFIGURED'
    WHEN name = 'app.settings.supabase_service_role_key' AND setting IS NOT NULL THEN '✅ CONFIGURED'
    ELSE '❌ NOT CONFIGURED'
  END as status
FROM pg_settings
WHERE name LIKE 'app.settings.%';
```

**Expected**: Both settings should show ✅ CONFIGURED

**If Missing**: Set them via SQL:
```sql
ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://cmvpnsqiefbsqkwnraka.supabase.co';

-- Get your service role key from: Settings > API > service_role
ALTER DATABASE postgres SET "app.settings.supabase_service_role_key" = 'YOUR_SERVICE_ROLE_KEY_HERE';
```

---

### **Step 4: Verify Cron Jobs Set Up** ✅

**Run in Supabase SQL Editor**:

```sql
-- Check if retry cron job is scheduled
-- Note: cron.job doesn't have jobname column, identify by command text
SELECT 
  jobid,
  schedule,
  LEFT(command, 80) as command_preview,
  active,
  CASE 
    WHEN command LIKE '%retry-failed-notifications%' AND active = true THEN '✅ RETRY JOB SCHEDULED'
    WHEN command LIKE '%retry-failed-notifications%' AND active = false THEN '⚠️ RETRY JOB EXISTS BUT INACTIVE'
    ELSE '❌ RETRY JOB MISSING'
  END as status
FROM cron.job
WHERE command LIKE '%retry-failed-notifications%'
ORDER BY jobid DESC
LIMIT 1;
```

**Expected**: Should show 1 row with `active = true`

**If Missing**: Run migration `20260119000005_setup_retry_notifications_cron.sql`

---

### **Step 5: Verify Trigger is Active** ✅

**Run in Supabase SQL Editor**:

```sql
-- Check if alarm-to-chat trigger is active
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_statement,
  CASE 
    WHEN trigger_name = 'trigger_alarm_to_chat' THEN '✅ TRIGGER ACTIVE'
    ELSE '❌ TRIGGER MISSING'
  END as status
FROM information_schema.triggers
WHERE trigger_name = 'trigger_alarm_to_chat';
```

**Expected**: Should show 1 row with trigger details

---

### **Step 6: Test Proactive Notification Flow** ✅

**Manual Test**:

1. **Create a test event**:
```sql
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message,
  metadata
) VALUES (
  'YOUR_DEVICE_ID',  -- Replace with actual device ID
  'low_battery',
  'warning',
  'Battery Low',
  'Vehicle battery is running low',
  '{}'::jsonb
);
```

2. **Check if chat message was created**:
```sql
SELECT 
  id,
  device_id,
  role,
  content,
  is_proactive,
  alert_id,
  created_at
FROM vehicle_chat_history
WHERE is_proactive = true
ORDER BY created_at DESC
LIMIT 5;
```

3. **Check if event was marked as notified**:
```sql
SELECT 
  id,
  device_id,
  event_type,
  notified,
  notified_at,
  created_at
FROM proactive_vehicle_events
WHERE device_id = 'YOUR_DEVICE_ID'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected**: 
- ✅ Chat message should be created with `is_proactive = true`
- ✅ Event should have `notified = true` and `notified_at` set

---

### **Step 7: Test Retry Function Manually** ✅

**Run in Supabase Dashboard** or via curl:

```bash
# Invoke retry function manually
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/retry-failed-notifications' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

**Expected**: Should return JSON with `success: true` and `retried: 0` (if no failures)

---

## 🎯 **DEPLOYMENT STEPS**

### **Step 1: Apply Missing Migrations** (If Any)

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new
2. Run `verify_migration_status.sql` (if exists)
3. Apply any missing migrations from `supabase/migrations/` folder

### **Step 2: Deploy Edge Functions**

```bash
# Deploy all critical edge functions
supabase functions deploy proactive-alarm-to-chat --no-verify-jwt
supabase functions deploy retry-failed-notifications --no-verify-jwt
supabase functions deploy sync-trips-incremental --no-verify-jwt
```

Or deploy via Supabase Dashboard:
- Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
- Deploy each function manually

### **Step 3: Set Up Cron Job**

**Option A: Apply Migration** (Recommended):
```sql
-- Run migration 20260119000005_setup_retry_notifications_cron.sql
```

**Option B: Manual Setup**:
```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule retry job
SELECT cron.schedule(
  'retry-failed-notifications-15min',
  '*/15 * * * *',
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

### **Step 4: Configure Database Settings** (If Not Set)

```sql
-- Set Supabase URL
ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://cmvpnsqiefbsqkwnraka.supabase.co';

-- Set service role key (get from Settings > API > service_role)
ALTER DATABASE postgres SET "app.settings.supabase_service_role_key" = 'YOUR_SERVICE_ROLE_KEY_HERE';
```

### **Step 5: Run Verification Checks**

Run all checks from "PRE-DEPLOYMENT CHECKS" above to verify everything is working.

---

## ✅ **POST-DEPLOYMENT MONITORING**

### **Monitor Edge Function Logs**:

```bash
# Watch logs for proactive-alarm-to-chat
supabase functions logs proactive-alarm-to-chat --tail 50

# Watch logs for retry-failed-notifications
supabase functions logs retry-failed-notifications --tail 50
```

### **Monitor Database**:

```sql
-- Check failed events count
SELECT 
  COUNT(*) as failed_count,
  COUNT(*) FILTER (WHERE resolved = false) as unresolved_count
FROM edge_function_errors;

-- Check recent notifications
SELECT 
  COUNT(*) as total_notifications,
  COUNT(*) FILTER (WHERE notified = true) as notified_count,
  COUNT(*) FILTER (WHERE notified = false) as pending_count
FROM proactive_vehicle_events
WHERE created_at >= now() - INTERVAL '24 hours';

-- Check cron job execution
-- Note: Use jobid to identify the retry job (get jobid from cron.job first)
WITH retry_job AS (
  SELECT jobid 
  FROM cron.job 
  WHERE command LIKE '%retry-failed-notifications%' 
  ORDER BY jobid DESC 
  LIMIT 1
)
SELECT 
  jrd.jobid,
  jrd.runid,
  jrd.job_pid,
  jrd.database,
  jrd.username,
  LEFT(jrd.command, 80) as command_preview,
  jrd.status,
  jrd.return_message,
  jrd.start_time,
  jrd.end_time
FROM cron.job_run_details jrd
CROSS JOIN retry_job rj
WHERE jrd.jobid = rj.jobid
ORDER BY jrd.start_time DESC
LIMIT 10;
```

---

## 🎉 **DEPLOYMENT COMPLETE**

**Status**: ✅ **READY FOR PRODUCTION**

After completing all verification checks:
- ✅ All migrations applied
- ✅ All edge functions deployed
- ✅ Cron jobs configured
- ✅ Database settings configured
- ✅ Triggers active
- ✅ Test notifications working

**Next**: Monitor logs for 24 hours and watch for any errors.
