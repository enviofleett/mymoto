# Fix: Missing `current_operation` Column Warning

## Issue Explanation

The `sync-trips-incremental` function is trying to update a `current_operation` column in the `trip_sync_status` table, but this column doesn't exist in your database yet.

**Warning Messages:**
```
WARNING [sync-trips-incremental] Error updating completion status: Could not find the 'current_operation' column of 'trip_sync_status' in the schema cache
WARNING [sync-trips-incremental] Error updating progress: Could not find the 'current_operation' column of 'trip_sync_status' in the schema cache
```

## Root Cause

The migration file `20260119000004_add_trip_sync_progress.sql` exists but hasn't been applied to your production database. This migration adds:
- `trips_total` (INTEGER) - Total number of trips to process
- `sync_progress_percent` (INTEGER) - Progress percentage (0-100)
- `current_operation` (TEXT) - Current operation description for user feedback

## Impact

- **Functionality:** The function still works, but progress tracking is disabled
- **User Experience:** Users won't see real-time sync progress
- **Logs:** Warning messages appear but don't break the function

## Solution

### Option 1: Apply Migration via SQL Editor (Recommended)

1. Go to Supabase SQL Editor:
   https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new

2. Copy and paste the contents of `APPLY_TRIP_SYNC_PROGRESS_COLUMNS.sql`

3. Click "Run" to execute

4. Verify the columns were added (the query at the end will show the results)

### Option 2: Apply via Supabase CLI

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase db push
```

This will apply all pending migrations including the progress columns.

## Verification

After applying the migration, check the logs again. You should see:
- ✅ No more warnings about `current_operation` column
- ✅ Progress updates working correctly
- ✅ Real-time sync status visible in the UI

## Files Involved

- **Migration File:** `supabase/migrations/20260119000004_add_trip_sync_progress.sql`
- **Function Code:** `supabase/functions/sync-trips-incremental/index.ts` (lines 1190, 1380, 1411, 1451)
- **Frontend Type:** `src/hooks/useTripSync.ts` (line 16) - expects `current_operation`

---

**Status:** Non-critical warning - function works but progress tracking is disabled until migration is applied.
