# GPS51 Direct Data Sync - Deployment Guide

## Overview

This guide walks you through deploying the GPS51 direct data sync implementation to ensure your dashboard displays 100% accurate data matching the GPS51 platform.

---

## Prerequisites

- Access to Supabase Dashboard
- Database access (SQL Editor)
- Edge Functions deployment access
- GPS51 credentials configured in environment

---

## Deployment Steps

### Step 1: Apply Database Migrations ⚙️

**Method 1: Using Supabase Dashboard**

1. Open Supabase Dashboard → SQL Editor
2. Create a new query
3. Copy and paste the contents of:
   - `supabase/migrations/20260124000000_create_gps51_sync_tables.sql`
4. Click "Run"
5. Verify success (should show "Success. No rows returned")
6. Repeat for:
   - `supabase/migrations/20260124000001_setup_gps51_sync_cron.sql`

**Method 2: Using Supabase CLI** (if available)

```bash
# Link to project (if not already linked)
supabase link --project-ref cmvpnsqiefbsqkwnraka

# Push migrations
supabase db push

# Or run migrations individually
supabase migration up
```

**Verification:**

```sql
-- Check that tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('gps51_trips', 'gps51_alarms', 'gps51_sync_status');
-- Should return 3 rows

-- Check that cron jobs exist
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'sync-gps51%';
-- Should return 2 rows
```

---

### Step 2: Configure App Settings 🔧

Run these SQL commands in Supabase SQL Editor:

```sql
-- Get your Supabase URL and service role key from:
-- Supabase Dashboard → Project Settings → API

-- Set Supabase URL
SELECT set_app_setting(
  'supabase_url',
  'https://cmvpnsqiefbsqkwnraka.supabase.co'
);

-- Set service role key (IMPORTANT: Use your actual service role key)
SELECT set_app_setting(
  'supabase_service_role_key',
  'YOUR_SERVICE_ROLE_KEY_HERE'
);

-- Verify settings
SELECT key, value
FROM app_settings
WHERE key LIKE 'supabase%';
```

**⚠️ IMPORTANT**: Replace `YOUR_SERVICE_ROLE_KEY_HERE` with your actual service role key from Supabase Dashboard → Project Settings → API → service_role (secret)

---

### Step 3: Deploy Edge Functions 🚀

**Method 1: Using Supabase Dashboard**

1. Open Supabase Dashboard → Edge Functions
2. Click "Deploy new function"
3. For `sync-gps51-trips`:
   - Name: `sync-gps51-trips`
   - Copy code from: `supabase/functions/sync-gps51-trips/index.ts`
   - Paste and deploy
4. Repeat for `sync-gps51-alarms`:
   - Name: `sync-gps51-alarms`
   - Copy code from: `supabase/functions/sync-gps51-alarms/index.ts`
   - Paste and deploy

**Method 2: Using Supabase CLI** (if available)

```bash
# Deploy both functions
supabase functions deploy sync-gps51-trips
supabase functions deploy sync-gps51-alarms

# Or deploy all functions
supabase functions deploy
```

**Verification:**

```bash
# List deployed functions
supabase functions list

# Or check in Supabase Dashboard → Edge Functions
# Should see: sync-gps51-trips and sync-gps51-alarms
```

---

### Step 4: Test Manual Sync 🧪

Run these SQL commands to test the sync functions:

```sql
-- Test trip sync for one vehicle (last 7 days)
-- Replace 'YOUR_DEVICE_ID' with an actual device ID
SELECT trigger_gps51_trips_sync('YOUR_DEVICE_ID', 7);

-- Expected response:
-- {
--   "success": true,
--   "records_received": 10,
--   "trips_inserted": 8,
--   "trips_updated": 2,
--   "errors": 0
-- }

-- Check if trips were inserted
SELECT COUNT(*) FROM gps51_trips WHERE device_id = 'YOUR_DEVICE_ID';
-- Should be > 0 if vehicle has trips

-- Test alarm sync
SELECT trigger_gps51_alarms_sync(ARRAY['YOUR_DEVICE_ID']);

-- Expected response:
-- {
--   "success": true,
--   "alarms_found": 5,
--   "alarms_inserted": 5,
--   "errors": 0
-- }

-- Check sync status
SELECT * FROM gps51_sync_status WHERE device_id = 'YOUR_DEVICE_ID';
-- Should show recent sync times and success status
```

---

### Step 5: Verify Data Accuracy 📊

**Trip Report Verification:**

1. Open GPS51 platform: https://gps51.com
   - Navigate to: Reports → Trip Report
   - Select a vehicle and today's date
   - Note: trip count, first trip distance

2. Query dashboard database:
```sql
SELECT
  COUNT(*) AS trip_count,
  SUM(distance_km) AS total_distance_km
FROM gps51_trips
WHERE device_id = 'YOUR_DEVICE_ID'
  AND start_time::date = CURRENT_DATE;
```

3. Compare: Numbers should match exactly ✅

**Alarm Report Verification:**

1. Open GPS51 platform
   - Navigate to: Reports → Alarm Report
   - Select a vehicle and last 7 days
   - Note: alarm count, latest alarm type

2. Query dashboard database:
```sql
SELECT
  COUNT(*) AS alarm_count,
  alarm_description_en,
  alarm_time
FROM gps51_alarms
WHERE device_id = 'YOUR_DEVICE_ID'
  AND alarm_time >= CURRENT_DATE - 7
ORDER BY alarm_time DESC;
```

3. Compare: Numbers should match exactly ✅

---

### Step 6: Enable Automatic Sync 🔄

The cron jobs are already configured in Step 1. Verify they're running:

```sql
-- Check cron job status
SELECT
  jobname,
  schedule,
  active,
  database,
  command
FROM cron.job
WHERE jobname LIKE 'sync-gps51%';

-- Check recent cron job runs
SELECT
  jobid,
  runid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid IN (
  SELECT jobid FROM cron.job WHERE jobname LIKE 'sync-gps51%'
)
ORDER BY start_time DESC
LIMIT 10;
```

**Expected**:
- ✅ Both cron jobs exist and are active
- ✅ Recent runs show status='succeeded'
- ✅ No error messages

**⚠️ If cron jobs are not running:**

Check that `pg_cron` extension is enabled:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Verify it's enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

---

### Step 7: Deploy Frontend Changes 🖥️

**Method 1: Git Deployment** (Recommended)

If your frontend is deployed via Git (Vercel, Netlify, etc.):

```bash
# Changes are already committed and pushed
# Simply merge the branch or create a PR
git checkout main
git merge claude/fix-report-data-sync-8km68
git push origin main

# Or create PR on GitHub and merge
```

**Method 2: Manual Build and Deploy**

```bash
# Build the project
npm run build

# Deploy the dist folder to your hosting service
# (Method depends on your hosting provider)
```

**Verification:**

1. Open dashboard in browser
2. Navigate to Vehicle Profile page
3. Check browser console (F12) for:
   - No errors
   - Query keys should be 'gps51-trips' and 'gps51-alarms'
4. Verify data displays correctly

---

## Post-Deployment Verification ✅

### Checklist

Run through this checklist to ensure everything is working:

- [ ] **Database Migrations Applied**
  - [ ] `gps51_trips` table exists
  - [ ] `gps51_alarms` table exists
  - [ ] `gps51_sync_status` table exists
  - [ ] All indexes created
  - [ ] RLS policies active

- [ ] **App Settings Configured**
  - [ ] `supabase_url` set
  - [ ] `supabase_service_role_key` set

- [ ] **Edge Functions Deployed**
  - [ ] `sync-gps51-trips` deployed and working
  - [ ] `sync-gps51-alarms` deployed and working

- [ ] **Manual Sync Tests Pass**
  - [ ] Trip sync returns success
  - [ ] Trips inserted into database
  - [ ] Alarm sync returns success
  - [ ] Sync status updated

- [ ] **Data Accuracy Verified**
  - [ ] Trip counts match GPS51 platform
  - [ ] Trip distances match GPS51 platform
  - [ ] Alarm counts match GPS51 platform

- [ ] **Automatic Sync Working**
  - [ ] Cron jobs exist and active
  - [ ] Recent cron runs successful
  - [ ] Sync status shows recent updates

- [ ] **Frontend Updated**
  - [ ] Changes deployed
  - [ ] No console errors
  - [ ] Data displays correctly
  - [ ] Trip report shows GPS51 data
  - [ ] Alarm report shows GPS51 data

---

## Troubleshooting 🔧

### Issue: Migrations Fail

**Error**: "relation already exists"

**Solution**:
```sql
-- Check if tables exist
\dt gps51_*

-- If they exist but are empty, drop and recreate:
DROP TABLE IF EXISTS gps51_trips CASCADE;
DROP TABLE IF EXISTS gps51_alarms CASCADE;
DROP TABLE IF EXISTS gps51_sync_status CASCADE;

-- Then re-run migrations
```

---

### Issue: Cron Jobs Not Running

**Error**: No recent runs in `cron.job_run_details`

**Solution**:
```sql
-- 1. Check if pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Check if app settings are set
SELECT * FROM app_settings WHERE key LIKE 'supabase%';

-- 3. Check if net extension is available
CREATE EXTENSION IF NOT EXISTS http;

-- 4. Manually trigger sync to test
SELECT trigger_gps51_trips_sync('DEVICE_ID', 7);
```

---

### Issue: Edge Functions Return 404

**Error**: "Function not found"

**Solution**:
1. Verify function is deployed in Supabase Dashboard
2. Check function name matches exactly (case-sensitive)
3. Ensure function has correct permissions
4. Check Supabase logs for errors

---

### Issue: No Trips/Alarms Synced

**Error**: `gps51_trips` or `gps51_alarms` table is empty

**Solution**:
```sql
-- Check sync status for errors
SELECT * FROM gps51_sync_status;

-- Check if GPS51 credentials are configured
SELECT * FROM gps51_credentials;

-- Manually trigger sync with verbose logging
SELECT trigger_gps51_trips_sync('DEVICE_ID', 30);

-- Check Edge Function logs in Supabase Dashboard
```

---

### Issue: Data Doesn't Match GPS51

**Error**: Trip counts or distances differ from GPS51 platform

**Possible Causes**:
1. Sync hasn't completed yet (wait 10 minutes)
2. Different time ranges being compared
3. Time zone differences

**Solution**:
```sql
-- Check last sync time
SELECT
  device_id,
  last_trip_sync_at,
  trips_synced_count,
  sync_status
FROM gps51_sync_status;

-- Manually sync again
SELECT trigger_gps51_trips_sync('DEVICE_ID', 7);

-- Compare exact time range with GPS51
SELECT *
FROM gps51_trips
WHERE device_id = 'DEVICE_ID'
  AND start_time >= '2024-01-24 00:00:00'
  AND start_time < '2024-01-25 00:00:00'
ORDER BY start_time DESC;
```

---

## Monitoring & Maintenance 📈

### Daily Checks

```sql
-- Check sync status for all vehicles
SELECT
  device_id,
  sync_status,
  last_trip_sync_at,
  last_alarm_sync_at,
  trips_synced_count,
  alarms_synced_count,
  trip_sync_error,
  alarm_sync_error
FROM gps51_sync_status
WHERE sync_status = 'error'
   OR last_trip_sync_at < now() - interval '1 hour'
ORDER BY updated_at DESC;

-- Check cron job runs
SELECT
  j.jobname,
  r.status,
  r.return_message,
  r.start_time,
  r.end_time
FROM cron.job j
LEFT JOIN cron.job_run_details r ON j.jobid = r.jobid
WHERE j.jobname LIKE 'sync-gps51%'
  AND r.start_time >= now() - interval '24 hours'
ORDER BY r.start_time DESC;
```

### Weekly Checks

```sql
-- Check data accuracy for sample vehicles
SELECT
  device_id,
  COUNT(*) AS trip_count,
  SUM(distance_km) AS total_distance,
  MAX(start_time) AS latest_trip
FROM gps51_trips
WHERE start_time >= now() - interval '7 days'
GROUP BY device_id
ORDER BY trip_count DESC
LIMIT 10;

-- Check alarm distribution
SELECT
  severity,
  COUNT(*) AS alarm_count
FROM gps51_alarms
WHERE alarm_time >= now() - interval '7 days'
GROUP BY severity
ORDER BY alarm_count DESC;
```

---

## Rollback Plan 🔙

If you need to rollback:

### Step 1: Disable Cron Jobs

```sql
-- Disable GPS51 sync cron jobs
SELECT cron.unschedule('sync-gps51-trips-all-vehicles');
SELECT cron.unschedule('sync-gps51-alarms-all-vehicles');
```

### Step 2: Revert Frontend Changes

```bash
# Revert to previous commit
git revert HEAD
git push origin main
```

### Step 3: Keep Database Tables

Note: We DON'T drop the GPS51 tables because they contain valuable data. Instead, the frontend will stop using them and fall back to the old sources.

---

## Success Criteria 🎯

Deployment is successful when:

✅ All database tables exist with correct schema
✅ Both Edge Functions deployed and responding
✅ Manual sync tests pass for trips and alarms
✅ Trip data matches GPS51 platform 100%
✅ Alarm data matches GPS51 platform 100%
✅ Cron jobs running automatically every 5-10 minutes
✅ Frontend displays GPS51 data without console errors
✅ No regressions in existing functionality

---

## Support

For issues or questions:

1. Check **DIAGNOSIS_GPS51_DATA_SYNC.md** for root cause analysis
2. Follow **TESTING_GUIDE_GPS51_SYNC.md** for detailed testing
3. Use **CURSOR_VALIDATION_PROMPT.md** for code validation
4. Review Supabase logs in Dashboard → Logs
5. Check Edge Function logs for specific errors

---

## Next Steps After Deployment

1. Monitor sync status for 24 hours
2. Verify data accuracy with GPS51 platform daily
3. Review cron job logs weekly
4. Set up alerts for sync failures
5. Document any edge cases or issues found

---

**Deployment completed on**: `date`

**Deployed by**: [Your Name]

**Version**: 1.0.0
