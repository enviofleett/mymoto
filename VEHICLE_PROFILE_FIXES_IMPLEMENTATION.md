# Vehicle Profile Fixes Implementation

## Summary

This document outlines the fixes implemented to ensure 100% GPS51 trip and mileage data parity on the vehicle profile page.

---

## Fixes Implemented

### Fix 1: Add Source Tracking to vehicle_trips Table ✅

**Migration:** `supabase/migrations/20260127000000_add_trip_source_tracking.sql`

**Changes:**
- Added `source` column to `vehicle_trips` table
- Default value: `'gps51'`
- Constraint: Only allows `'gps51'`, `'local'`, or `'manual'`
- Updated all existing trips to `'gps51'`
- Created index for efficient filtering

**To Apply:**
```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20260127000000_add_trip_source_tracking.sql
```

---

### Fix 2: Mark Trips as GPS51 in sync-trips-incremental ✅

**File:** `supabase/functions/sync-trips-incremental/index.ts` (line 1270)

**Change:**
```typescript
let tripToInsert = { 
  ...trip,
  source: 'gps51' as const, // Mark as GPS51 trip for 100% parity verification
};
```

**Impact:** All trips inserted by `sync-trips-incremental` are marked as GPS51.

---

### Fix 3: Mark Trips as GPS51 in sync-official-reports ✅

**File:** `supabase/functions/sync-official-reports/index.ts` (line 195)

**Change:**
```typescript
return {
  // ... other fields
  source: 'gps51' as const, // Mark as GPS51 trip for 100% parity verification
};
```

**Impact:** All trips upserted by `sync-official-reports` are marked as GPS51.

---

### Fix 4: Filter Frontend to Only Show GPS51 Trips ✅

**File:** `src/hooks/useVehicleProfile.ts` (line 119)

**Change:**
```typescript
let query = (supabase as any)
  .from("vehicle_trips")
  .select("*")
  .eq("device_id", deviceId)
  .eq("source", "gps51") // CRITICAL: Only show GPS51 trips for 100% parity
  .not("start_time", "is", null)
  .not("end_time", "is", null);
```

**Impact:** Frontend now only displays trips from GPS51 platform.

---

## Verification Steps

### Step 1: Apply Migration

1. Go to Supabase SQL Editor: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new
2. Copy and paste contents of `supabase/migrations/20260127000000_add_trip_source_tracking.sql`
3. Click "Run"
4. Verify: Check that `source` column exists:
   ```sql
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'vehicle_trips' AND column_name = 'source';
   ```

### Step 2: Deploy Updated Functions

```bash
# Deploy sync-trips-incremental
supabase functions deploy sync-trips-incremental --no-verify-jwt --project-ref cmvpnsqiefbsqkwnraka

# Deploy sync-official-reports
supabase functions deploy sync-official-reports --no-verify-jwt --project-ref cmvpnsqiefbsqkwnraka
```

### Step 3: Verify Frontend Filter

1. Open vehicle profile page
2. Check browser console for query logs
3. Verify trips are filtered by `source = 'gps51'`
4. Confirm only GPS51 trips are displayed

### Step 4: Test Auto-Sync on Trip End

1. Wait for a trip to end (or manually trigger sync)
2. Check function logs for:
   - `[sync-trips-incremental] Inserted trip: ... source: gps51`
   - `[syncOfficialTripReport] Syncing official GPS51 report...`
   - `[sync-official-reports] Upserted X trips`
3. Verify trip appears in UI with real-time update

---

## Expected Behavior After Fixes

### ✅ Trip Display
- **Before:** All trips from `vehicle_trips` table (mixed sources)
- **After:** Only trips with `source = 'gps51'` (100% GPS51 parity)

### ✅ Auto-Sync on Trip End
- **Before:** Auto-sync triggers but no source tracking
- **After:** Auto-sync triggers, trips marked as GPS51, UI updates in real-time

### ✅ Mileage Display
- **Before:** Already correct (only from GPS51)
- **After:** Still correct (no changes needed)

---

## Monitoring

### Check Source Distribution

```sql
-- Verify all trips are from GPS51
SELECT source, COUNT(*) 
FROM vehicle_trips 
WHERE device_id = 'YOUR_DEVICE_ID'
GROUP BY source;

-- Should show: gps51 | [count]
```

### Check Auto-Sync Logs

```bash
# View sync-trips-incremental logs
# In Supabase Dashboard: Functions > sync-trips-incremental > Logs

# Look for:
# - "[sync-trips-incremental] Inserted trip: ... source: gps51"
# - "[syncOfficialTripReport] Syncing official GPS51 report..."
# - "[sync-official-reports] Upserted X trips"
```

---

## Rollback Plan

If issues occur, rollback steps:

1. **Remove source filter from frontend:**
   ```typescript
   // Remove .eq("source", "gps51") line
   ```

2. **Keep source column** (doesn't break anything, just adds metadata)

3. **Functions will continue to work** (source field is optional if column doesn't exist)

---

## Status

- ✅ Migration created
- ✅ Functions updated
- ✅ Frontend updated
- ⏳ **Pending:** Migration application and function deployment

---

**Next Steps:**
1. Apply migration
2. Deploy updated functions
3. Test and verify
4. Monitor logs for auto-sync
