# Fix GPS Sync Health Discrepancy

## Problem
GPS Sync Health Dashboard shows different numbers than Metrics Grid:
- GPS Sync Health: 753 online, 218 moving
- Metrics Grid: Different numbers

## Root Cause

### Issue 1: Moving Count Definition Mismatch
- **GPS Sync Health**: Uses `sync_priority = 'high'` which is set when `speed > 3 km/h`
- **Metrics Grid**: Uses `speed > 0` (any movement counts)

### Issue 2: Online Count Definition Mismatch
- **GPS Sync Health**: Counts ALL vehicles with `is_online = true`
- **Metrics Grid**: Only counts vehicles with `is_online = true` AND valid GPS coordinates

## Solution

A migration has been created to fix the `v_gps_sync_health` view to match the frontend logic exactly.

**File:** `supabase/migrations/20260119000000_fix_gps_sync_health_view.sql`

### Changes:
1. **Online Count**: Now requires valid GPS coordinates (not just `is_online = true`)
2. **Moving Count**: Now uses `speed > 0` instead of `sync_priority = 'high'`

## How to Apply

Run the migration in Supabase SQL Editor:

```sql
-- Copy and paste the contents of:
-- supabase/migrations/20260119000000_fix_gps_sync_health_view.sql
```

Or deploy via Supabase CLI:
```bash
supabase db push
```

## Expected Result

After applying the migration:
- GPS Sync Health Dashboard will show the same numbers as Metrics Grid
- Both will use consistent logic:
  - **Online**: `is_online = true` AND valid coordinates
  - **Moving**: `speed > 0` AND online AND valid coordinates

## Verification

After applying, verify both components show matching numbers:
1. Check GPS Sync Health Dashboard
2. Check Metrics Grid (Online Vehicles, Moving Now)
3. Numbers should match
