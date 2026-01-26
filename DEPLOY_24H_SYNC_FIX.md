# Deploy 24-Hour Sync Fix

## Changes Summary

The `sync-trips-incremental` function has been updated to comply with requirements:
- ✅ **Only sync last 24 hours** (no historical backfill)
- ✅ **Only auto-sync recent trips** (trips ended within 24 hours)

### Code Changes

1. **Removed 30-day backfill** (line 1145)
   - Changed from `30 * 24 * 60 * 60 * 1000` to `24 * 60 * 60 * 1000`
   - Updated log message to reflect "no backfill"

2. **Added 24-hour check for auto-sync** (lines 1355-1366)
   - Only calls `syncOfficialTripReport()` for trips that ended within 24 hours
   - Skips historical trips with informative log message

## Deployment Instructions

### Option 1: Using Deployment Script (Recommended)

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
./scripts/deploy-sync-trips-incremental.sh
```

**Note:** You may need to login first:
```bash
supabase login
```

### Option 2: Manual CLI Deploy

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Login if not already logged in
supabase login

# Deploy the function
supabase functions deploy sync-trips-incremental \
  --no-verify-jwt \
  --project-ref cmvpnsqiefbsqkwnraka
```

### Option 3: Via Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click on `sync-trips-incremental` function
3. Click **"Deploy"** or **"Redeploy"**
4. Upload the updated `supabase/functions/sync-trips-incremental/index.ts` file

## Verification After Deployment

### 1. Check Function Logs

```bash
supabase functions logs sync-trips-incremental --tail
```

Or view in dashboard:
https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions/sync-trips-incremental/logs

### 2. Expected Log Messages

After deployment, you should see:
- ✅ `"processing last 24 hours (no backfill)"` instead of "30 days"
- ✅ `"Skipping sync for historical trip (ended X hours ago, > 24h limit)"` for old trips
- ✅ Auto-sync only triggers for trips ended within 24 hours

### 3. Test the Function

1. Go to a vehicle profile page
2. Click "Sync Trips" button
3. Check logs to verify:
   - Only last 24 hours are processed
   - Historical trips are skipped
   - Recent trips trigger auto-sync

## What Changed

### Before:
- First sync: 30 days of historical data
- Auto-sync: Triggered for ALL trips (including historical)

### After:
- First sync: Only last 24 hours
- Auto-sync: Only trips ended within 24 hours

## Files Modified

- `supabase/functions/sync-trips-incremental/index.ts`
  - Line 1145: Changed backfill from 30 days to 24 hours
  - Lines 1355-1366: Added 24-hour check before auto-sync

## Related Documentation

- [AUTO_SYNC_IMPLEMENTATION_ISSUES.md](./AUTO_SYNC_IMPLEMENTATION_ISSUES.md) - Issues identified
- [AUTO_SYNC_FIXES_APPLIED.md](./AUTO_SYNC_FIXES_APPLIED.md) - Detailed fix documentation
- [AUTO_SYNC_ON_TRIP_END.md](./AUTO_SYNC_ON_TRIP_END.md) - Original implementation docs

---

**Ready to Deploy:** All changes have been verified and are ready for production deployment.
