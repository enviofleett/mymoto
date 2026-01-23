# Cleanup and Prevent Duplicates - Step-by-Step Guide

## Problem
You're trying to create a unique index, but there are still duplicate trips in the database for other devices (e.g., device `358657105965540`).

## Solution: Clean First, Then Protect

### Step 1: Preview What Will Be Deleted

Run **Query 1** from `DELETE_ALL_DUPLICATE_TRIPS.sql` to see:
- Which devices have duplicates
- How many trips will be kept vs deleted per device
- Total summary across all devices

**Expected output:**
```
device_id          | trips_to_keep | trips_to_delete | total_duplicate_trips | unique_trip_groups
-------------------+---------------+---------------+----------------------+-------------------
358657105965540    | 5             | 3               | 8                    | 5
358657105966092    | 37            | 0               | 0                    | 37
...
```

### Step 2: Review the Summary

Run **Query 2** from `DELETE_ALL_DUPLICATE_TRIPS.sql` to see:
- Total trips to keep across all devices
- Total trips to delete across all devices
- Number of devices affected

### Step 3: Delete All Duplicates

1. **Review Steps 1 & 2** - Make sure the numbers look correct
2. **Uncomment Query 3** in `DELETE_ALL_DUPLICATE_TRIPS.sql`
3. **Run Query 3** - This will delete all duplicate trips

**Expected result:**
- Returns list of deleted trip IDs
- Shows `device_id`, `start_time`, `end_time`, `created_at` for each deleted trip

### Step 4: Verify No Duplicates Remain

Run **Query 4** from `DELETE_ALL_DUPLICATE_TRIPS.sql` to verify:
- Should return **NO ROWS** if cleanup was successful
- If it returns rows, those devices still have duplicates (run Step 3 again)

### Step 5: Create the Unique Index

Once Step 4 shows no duplicates, run `PREVENT_DUPLICATE_TRIPS.sql`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_unique_timing 
ON vehicle_trips(device_id, start_time, end_time)
WHERE start_time IS NOT NULL AND end_time IS NOT NULL;
```

**This should now succeed!** ✅

## Quick Commands

### Option A: Clean All Devices at Once
```sql
-- 1. Preview (safe)
-- Run Query 1 & 2 from DELETE_ALL_DUPLICATE_TRIPS.sql

-- 2. Delete (after review)
-- Uncomment and run Query 3 from DELETE_ALL_DUPLICATE_TRIPS.sql

-- 3. Verify
-- Run Query 4 from DELETE_ALL_DUPLICATE_TRIPS.sql

-- 4. Create index
-- Run PREVENT_DUPLICATE_TRIPS.sql
```

### Option B: Clean Specific Device First
If you want to test on one device first:

```sql
-- Delete duplicates for specific device
WITH ranked_duplicates AS (
  SELECT 
    t.id,
    ROW_NUMBER() OVER (
      PARTITION BY t.device_id, t.start_time, t.end_time 
      ORDER BY 
        CASE 
          WHEN t.start_latitude != 0 AND t.start_longitude != 0 
           AND t.end_latitude != 0 AND t.end_longitude != 0 
           AND t.distance_km > 0 AND t.duration_seconds > 0
          THEN 4
          WHEN t.start_latitude != 0 AND t.start_longitude != 0 
           AND t.end_latitude != 0 AND t.end_longitude != 0 
          THEN 3
          WHEN t.distance_km > 0 OR t.duration_seconds > 0
          THEN 2
          ELSE 1
        END DESC,
        t.created_at DESC
    ) as keep_rank
  FROM vehicle_trips t
  WHERE t.device_id = '358657105965540'  -- Change device_id here
)
DELETE FROM vehicle_trips
WHERE id IN (
  SELECT id FROM ranked_duplicates WHERE keep_rank > 1
)
RETURNING id, device_id, start_time, end_time;
```

## After Cleanup

Once the unique index is created:
- ✅ No new duplicates can be inserted (database enforces it)
- ✅ Application code also checks for duplicates (defense in depth)
- ✅ Future syncs will skip duplicates automatically

## Troubleshooting

**If Step 4 still shows duplicates:**
- The deletion might have failed for some devices
- Check the error messages from Step 3
- Try running Step 3 again (it's idempotent - safe to run multiple times)

**If unique index creation still fails:**
- Run Step 4 again to verify no duplicates
- Check if there are NULL values in start_time or end_time
- The index has a WHERE clause to handle NULLs, but verify your data
