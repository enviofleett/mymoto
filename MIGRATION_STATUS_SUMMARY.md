# Ignition Detection Migration Status Summary

**Date:** 2026-01-20  
**Status Check:** ✅ Partial - Some migrations applied, one missing

## Current Status

### ✅ Applied Migrations

1. **position_history table** ✅
   - `ignition_confidence` column exists (numeric, nullable)
   - `ignition_detection_method` column exists (text, nullable)
   - `ignition_on` column exists (boolean, nullable)
   - **Migration:** `20260118051409_add_ignition_confidence.sql` ✅ Applied

2. **acc_state_history table** ✅
   - Table exists
   - `acc_state` column exists (text, NOT NULL)
   - **Migration:** `20260118051247_create_acc_state_history.sql` ✅ Applied

### ❌ Missing Migration

**vehicle_positions table** ❌
- `ignition_on` column exists (boolean, nullable) ✅
- `ignition_confidence` column **DOES NOT EXIST** ❌
- `ignition_detection_method` column **DOES NOT EXIST** ❌
- **Migration:** `20260120000009_add_ignition_confidence_to_vehicle_positions.sql` ❌ **NOT Applied**

## What This Means

- ✅ Historical position data (`position_history`) has confidence tracking
- ✅ ACC state history table exists and can store authoritative ignition data
- ❌ Current vehicle positions (`vehicle_positions`) **do NOT** have confidence tracking
- ⚠️ Edge functions may be trying to write confidence data to `vehicle_positions` but it will be silently ignored

## Next Steps

### 1. Apply Missing Migration

Run this migration to add confidence columns to `vehicle_positions`:

```sql
-- File: supabase/migrations/20260120000009_add_ignition_confidence_to_vehicle_positions.sql
```

Or apply it directly:

```bash
# Using Supabase CLI
supabase migration up

# Or manually run the SQL in Supabase Dashboard SQL Editor
```

### 2. Verify After Migration

After applying the migration, run:

```sql
-- Check that columns now exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vehicle_positions'
  AND column_name IN ('ignition_confidence', 'ignition_detection_method');
```

### 3. Backfill Data (Optional)

Once columns exist, you may want to backfill confidence data for existing positions:

```sql
-- This will populate confidence for positions that have matching position_history records
UPDATE vehicle_positions vp
SET 
  ignition_confidence = ph.ignition_confidence,
  ignition_detection_method = ph.ignition_detection_method
FROM (
  SELECT DISTINCT ON (device_id)
    device_id,
    ignition_confidence,
    ignition_detection_method
  FROM position_history
  WHERE ignition_confidence IS NOT NULL
    AND ignition_detection_method IS NOT NULL
  ORDER BY device_id, gps_time DESC
) ph
WHERE vp.device_id = ph.device_id
  AND vp.ignition_confidence IS NULL;
```

## Impact Assessment

### Current Impact

- **Low Impact:** The system will continue to work, but:
  - Current vehicle positions won't show confidence scores
  - Monitoring queries for `vehicle_positions` won't work
  - Historical data (`position_history`) is fine

### After Migration

- ✅ Full confidence tracking in both tables
- ✅ Monitoring queries will work for current positions
- ✅ Better visibility into detection quality

## Files to Review

1. **VERIFY_IGNITION_IMPLEMENTATION.sql** - Updated to handle missing columns
2. **CHECK_COLUMNS_EXIST.sql** - Shows what columns exist
3. **APPLY_MONITORING_FUNCTIONS.sql** - Creates monitoring function (if needed)
4. **SCHEDULE_ACC_REPORT_SYNC.sql** - Schedules ACC report syncing

## Recommendation

**Priority: Medium**

Apply the missing migration when convenient. The system works without it, but you'll get better monitoring and visibility once it's applied.
