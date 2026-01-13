# Automatic Trip Sync Setup - Option 2 Implementation

## Overview

This implementation provides **automatic, incremental trip synchronization** that ensures travel history data is always up-to-date without manual intervention.

## What Was Implemented

### 1. Database Migration - Trip Sync Status Table
**File:** `supabase/migrations/20260113180000_trip_sync_status.sql`

- Created `trip_sync_status` table to track processing state for each device
- Tracks last sync time, last position processed, and sync status
- Includes RLS policies for security
- Helper functions for status initialization

### 2. Incremental Sync Edge Function
**File:** `supabase/functions/sync-trips-incremental/index.ts`

- **Smart incremental processing:** Only processes new position data since last sync
- **First-time sync:** Automatically processes last 7 days for new devices
- **Deduplication:** Prevents duplicate trips from being created
- **Error handling:** Tracks and reports errors per device
- **Performance:** Processes up to 5000 positions per device per run

### 3. Automatic Cron Job
**File:** `supabase/migrations/20260113180100_setup_trip_sync_cron.sql`

- Runs every 15 minutes automatically
- Uses pg_cron extension
- Calls the incremental sync Edge Function
- Manual trigger function available: `trigger_trip_sync(device_id, force_full)`

### 4. React Hooks for Trip Management
**File:** `src/hooks/useTripSync.ts`

- `useTripSyncStatus`: Monitor sync status for a device
- `useTriggerTripSync`: Manually trigger sync with force option
- `useRealtimeTripUpdates`: Subscribe to realtime trip insertions

### 5. Enhanced UI Components
**Updated Files:**
- `src/pages/owner/OwnerVehicleProfile/index.tsx`
- `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx`

**Features:**
- **Force Sync Button:** Manually sync last 7 days of trips
- **Sync Status Indicators:**
  - 🔄 Blue spinning icon: Sync in progress
  - ✅ Green check: Last sync completed
  - ⚠️ Red warning: Sync error
  - 📡 Green pulsing radio: Realtime updates active
- **Sync Details:** Shows last sync time and number of trips processed
- **Pull-to-Refresh:** Enhanced to use incremental sync

## Deployment Steps

### Step 1: Apply Database Migrations

```bash
# Apply the migrations to your Supabase database
npx supabase db push

# OR manually run the SQL files in the Supabase dashboard:
# 1. supabase/migrations/20260113180000_trip_sync_status.sql
# 2. supabase/migrations/20260113180100_setup_trip_sync_cron.sql
```

### Step 2: Deploy Edge Functions

```bash
# Deploy the new incremental sync function
npx supabase functions deploy sync-trips-incremental

# Verify deployment
npx supabase functions list
```

### Step 3: Configure Cron Job Settings

**IMPORTANT:** Set the service role key for the cron job:

```sql
-- Run this in Supabase SQL Editor
-- Replace YOUR_SERVICE_ROLE_KEY with your actual key from Supabase Dashboard > Settings > API
ALTER DATABASE postgres SET "app.settings.supabase_service_role_key" = 'YOUR_SERVICE_ROLE_KEY';
```

### Step 4: Enable Realtime for Required Tables

In Supabase Dashboard > Database > Replication:

1. Enable realtime for `vehicle_trips` table
2. Enable realtime for `trip_sync_status` table

### Step 5: Deploy Frontend

```bash
# Install dependencies (if not already done)
npm install

# Build the frontend
npm run build

# Deploy to your hosting platform
```

## How It Works

### Automatic Background Processing

```
Every 15 minutes:
  1. Cron job triggers sync-trips-incremental function
  2. Function checks trip_sync_status for each device
  3. Processes only NEW position data since last sync
  4. Inserts new trips to vehicle_trips table
  5. Updates trip_sync_status with latest timestamp
  6. Frontend receives realtime notification
  7. UI automatically refreshes with new trips
```

### Manual Force Sync

```
User clicks "Sync" button:
  1. Triggers sync-trips-incremental with force_full_sync=true
  2. Processes last 7 days of position data
  3. Deduplicates to prevent duplicate trips
  4. Shows progress indicator while syncing
  5. Displays success toast with trip count
  6. Updates UI with new data
```

### Pull-to-Refresh

```
User pulls down to refresh:
  1. Triggers incremental sync in background
  2. Invalidates all cached queries
  3. Refetches fresh data from database
  4. Shows sync status and realtime indicator
```

## Key Features

### ✅ Automatic Processing
- Runs every 15 minutes without user intervention
- Processes only new data (efficient)
- Handles multiple devices simultaneously

### ✅ Manual Control
- Force Sync button for immediate updates
- Can process specific devices or all devices
- Force full sync option (last 7 days)

### ✅ Realtime Updates
- Instant notifications when new trips are created
- Live sync status updates
- Visual indicators for active subscriptions

### ✅ Error Handling
- Tracks and displays sync errors
- Per-device error reporting
- Retry mechanism in cron job

### ✅ Performance Optimized
- Incremental processing (only new data)
- Deduplication to prevent duplicates
- Batch processing with limits
- Smart caching with stale time

## Monitoring & Debugging

### Check Cron Job Status

```sql
-- View cron job status
SELECT * FROM cron_job_status;

-- View cron job run history
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-sync-trips-15min')
ORDER BY start_time DESC
LIMIT 10;
```

### Check Sync Status for a Device

```sql
-- View sync status
SELECT * FROM trip_sync_status WHERE device_id = 'YOUR_DEVICE_ID';

-- Manually trigger sync for a device
SELECT trigger_trip_sync('YOUR_DEVICE_ID', false);

-- Force full sync for a device (last 7 days)
SELECT trigger_trip_sync('YOUR_DEVICE_ID', true);
```

### Check Edge Function Logs

```bash
# View logs for incremental sync function
npx supabase functions logs sync-trips-incremental --tail

# View logs for specific invocation
npx supabase functions logs sync-trips-incremental --limit 100
```

### Browser Console Logs

Open browser console and look for:
- `[Realtime] Subscribing to trip updates for device: ...`
- `[Realtime] New trip detected: ...`
- `[Force Sync] Triggering full trip sync...`
- `[Pull-to-Refresh] Cache invalidated, refetching all data...`

## Troubleshooting

### Issue: No trips showing up

**Solution:**
1. Check if position_history has data: `SELECT COUNT(*) FROM position_history WHERE device_id = 'YOUR_DEVICE_ID'`
2. Check sync status: `SELECT * FROM trip_sync_status WHERE device_id = 'YOUR_DEVICE_ID'`
3. Manually trigger sync: Click "Sync" button in UI or run `SELECT trigger_trip_sync('YOUR_DEVICE_ID', true)`
4. Check Edge Function logs for errors

### Issue: Sync status shows "error"

**Solution:**
1. Check error_message in trip_sync_status table
2. Verify RLS policies allow access to position_history
3. Check Edge Function logs
4. Verify Supabase credentials are correct

### Issue: Realtime updates not working

**Solution:**
1. Verify realtime is enabled for `vehicle_trips` table in Supabase Dashboard
2. Check browser console for subscription status
3. Verify RLS policies allow reading trip_sync_status
4. Check network tab for WebSocket connections

### Issue: Cron job not running

**Solution:**
1. Verify pg_cron extension is enabled
2. Check cron job exists: `SELECT * FROM cron.job WHERE jobname = 'auto-sync-trips-15min'`
3. Verify service role key is set: `SHOW app.settings.supabase_service_role_key`
4. Check cron job run history for errors

## Performance Considerations

### Current Settings
- **Cron frequency:** Every 15 minutes
- **Incremental lookback:** Since last sync (efficient)
- **First sync lookback:** 7 days
- **Position limit per run:** 5000 points
- **Query cache time:** 60 seconds (trips), 10 seconds (sync status)

### Optimization Options

**For faster updates:**
```sql
-- Change cron to run every 5 minutes
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'auto-sync-trips-15min'),
  schedule := '*/5 * * * *'
);
```

**For less frequent updates (cost savings):**
```sql
-- Change cron to run every 30 minutes
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'auto-sync-trips-15min'),
  schedule := '*/30 * * * *'
);
```

## Verification Checklist

- [ ] Database migrations applied successfully
- [ ] Edge Function deployed and accessible
- [ ] Cron job created and running
- [ ] Service role key configured for cron
- [ ] Realtime enabled for vehicle_trips and trip_sync_status
- [ ] Frontend deployed with new code
- [ ] Force Sync button visible in UI
- [ ] Sync status indicators working
- [ ] Realtime updates functioning
- [ ] Pull-to-refresh using incremental sync
- [ ] Console logs showing proper activity

## Next Steps (Optional Enhancements)

1. **Historical Data Backfill:** Run force sync for all devices to populate historical trips
2. **Analytics Dashboard:** Create admin view to monitor sync health across all devices
3. **Webhook Notifications:** Add webhook triggers when new trips are detected
4. **Trip Quality Scoring:** Add validation and quality metrics to trips
5. **Geofence Integration:** Trigger notifications when trips cross geofences

## Support

If you encounter issues not covered in this documentation:
1. Check Supabase logs and browser console
2. Verify all environment variables are correct
3. Review RLS policies for proper access
4. Test Edge Function directly via Supabase Dashboard
5. Check that all migrations were applied successfully

---

**Implementation Date:** 2026-01-13
**Status:** ✅ Complete - Ready for deployment
**Solution Type:** Option 2 - Intelligent Sync with Background Trip Processing
