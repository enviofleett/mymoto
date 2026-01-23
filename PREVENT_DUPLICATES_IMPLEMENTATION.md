# Prevent Duplicate Trips - Implementation Summary

## Problem
Device `358657105966092` had 141 trips with only 37 unique combinations, meaning 104 were duplicates. This was causing:
- UI showing duplicate trips
- Contradiction detection false positives
- Unnecessary database storage

## Solution Implemented

### 1. Database-Level Protection ✅

**File:** `PREVENT_DUPLICATE_TRIPS.sql`

Added a **unique index** to prevent exact duplicate trips at the database level:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_unique_timing 
ON vehicle_trips(device_id, start_time, end_time)
WHERE start_time IS NOT NULL AND end_time IS NOT NULL;
```

**Benefits:**
- Prevents duplicates even if application code has bugs
- Database enforces data integrity
- Fast lookup for duplicate checks

**Action Required:** Run `PREVENT_DUPLICATE_TRIPS.sql` to create the index.

### 2. Application-Level Protection ✅

Updated all three trip insertion points to check for duplicates before inserting:

#### A. `sync-trips-incremental/index.ts` (Main trip sync function)
- **Before:** Plain INSERT without duplicate checking
- **After:** Checks for exact duplicate (device_id, start_time, end_time) before inserting
- **Handles:** Race conditions (catches unique constraint violations)

#### B. `process-trips/index.ts` (Trip processing function)
- **Before:** Checked within 1-minute window (not exact enough)
- **After:** Checks for exact duplicate (device_id, start_time, end_time)
- **Handles:** Race conditions

#### C. `gps-history-backfill/index.ts` (Backfill function)
- **Before:** Used upsert with wrong conflict target (only device_id, start_time)
- **After:** Checks for exact duplicate (device_id, start_time, end_time) before inserting
- **Handles:** Race conditions

## How It Works

### Duplicate Detection Logic

1. **Before Insert:**
   ```typescript
   const { data: existing } = await supabase
     .from("vehicle_trips")
     .select("id")
     .eq("device_id", trip.device_id)
     .eq("start_time", trip.start_time)
     .eq("end_time", trip.end_time)
     .limit(1)
     .maybeSingle();
   
   if (existing) {
     // Skip - duplicate found
     continue;
   }
   ```

2. **During Insert (Race Condition Handling):**
   ```typescript
   if (insertError) {
     if (insertError.message.includes('duplicate key') || 
         insertError.message.includes('unique constraint')) {
       // Another process inserted the same trip - skip gracefully
       totalTripsSkipped++;
     } else {
       // Real error - log it
       errors.push(...);
     }
   }
   ```

### Why Both Levels?

- **Application-level check:** Prevents unnecessary database round-trips and provides better error messages
- **Database-level constraint:** Catches race conditions and prevents duplicates even if application code has bugs

## Testing

### 1. Run the Database Migration
```sql
-- Run PREVENT_DUPLICATE_TRIPS.sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_unique_timing 
ON vehicle_trips(device_id, start_time, end_time)
WHERE start_time IS NOT NULL AND end_time IS NOT NULL;
```

### 2. Verify Index Created
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'vehicle_trips' 
  AND indexname = 'idx_vehicle_trips_unique_timing';
```

### 3. Test Duplicate Prevention
Try to insert a duplicate trip - it should fail:
```sql
-- This should fail with unique constraint violation
INSERT INTO vehicle_trips (device_id, start_time, end_time, ...)
VALUES ('358657105966092', '2026-01-21 08:03:15+00', '2026-01-21 08:14:20+00', ...);
```

### 4. Monitor Logs
After deploying the updated functions, check logs for:
- `[sync-trips-incremental] Skipping duplicate trip: ...`
- `[process-trips] Skipping duplicate trip: ...`
- `[gps-history-backfill] Skipping duplicate trip: ...`

## Expected Results

✅ **No more duplicate trips** - Each unique (device_id, start_time, end_time) combination will only exist once

✅ **Better performance** - Fewer unnecessary inserts, smaller database

✅ **Cleaner UI** - Users won't see duplicate trips

✅ **Accurate analytics** - Trip counts and statistics will be correct

## Files Modified

1. ✅ `supabase/functions/sync-trips-incremental/index.ts` - Added duplicate checking
2. ✅ `supabase/functions/process-trips/index.ts` - Fixed duplicate checking (exact match)
3. ✅ `supabase/functions/gps-history-backfill/index.ts` - Fixed duplicate checking
4. ✅ `PREVENT_DUPLICATE_TRIPS.sql` - Database migration (NEW)

## Next Steps

1. **Deploy the database migration:**
   ```bash
   # Run PREVENT_DUPLICATE_TRIPS.sql in Supabase SQL Editor
   ```

2. **Deploy updated functions:**
   ```bash
   supabase functions deploy sync-trips-incremental
   supabase functions deploy process-trips
   supabase functions deploy gps-history-backfill
   ```

3. **Monitor for duplicate prevention:**
   - Check function logs for "Skipping duplicate trip" messages
   - Verify no new duplicates are created
   - Check database for any unique constraint violations (should be handled gracefully)

## Long-Term Maintenance

- The unique index will prevent duplicates automatically
- Application-level checks provide better error handling and logging
- If you need to allow near-duplicates (within same second), you can modify the index to use `date_trunc('second', ...)` instead of exact timestamps
