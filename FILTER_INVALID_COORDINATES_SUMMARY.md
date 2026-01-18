# Filter Invalid GPS Coordinates - Implementation Summary

## Problem
Vehicles were showing as "online" on the dashboard with invalid GPS coordinates (e.g., latitude 290, longitude 500). These are clearly invalid since:
- Valid latitude range: -90 to 90
- Valid longitude range: -180 to 180

## Solution Implemented

### 1. Database View Update
**File**: `supabase/migrations/20260119000001_filter_invalid_coordinates.sql`

Updated `v_gps_sync_health` view to filter invalid coordinates:
- Latitude must be between -90 and 90
- Longitude must be between -180 and 180
- Not null island (0, 0)

### 2. Frontend Query Filtering
**Files**: 
- `src/hooks/useFleetData.ts`
- `src/hooks/useFleetLiveData.ts`

Added coordinate range validation at the query level:
- Filters invalid coordinates before fetching data
- Uses Supabase query filters: `.gte('latitude', -90).lte('latitude', 90)` etc.

### 3. Frontend Validation Function
**Files**:
- `src/hooks/useFleetData.ts` (added `isValidCoordinate()`)
- `src/hooks/useFleetLiveData.ts` (added `isValidCoordinate()`)

Validates coordinates before using them:
- Checks for null/undefined
- Checks for NaN
- Checks valid ranges (-90 to 90 for lat, -180 to 180 for lon)
- Rejects null island (0, 0)

### 4. Monitoring Function
**File**: `supabase/migrations/20260119000001_filter_invalid_coordinates.sql`

Created `get_invalid_coordinate_vehicles()` function to:
- Identify vehicles with invalid coordinates
- Monitor data quality
- Help with cleanup

## How to Deploy

### Step 1: Run the Migration
Run in Supabase SQL Editor:
```sql
-- Copy content from: supabase/migrations/20260119000001_filter_invalid_coordinates.sql
```

### Step 2: Check for Invalid Data
Run in Supabase SQL Editor:
```sql
-- Copy content from: CHECK_INVALID_COORDINATES.sql
```

This will show:
- Count of vehicles with invalid coordinates
- Specific vehicles with issues
- Issue types (invalid lat, invalid lon, null island, etc.)

### Step 3: Verify the Fix
After deployment, check:
1. **GPS Sync Health Dashboard**: Should show only vehicles with valid coordinates
2. **Metrics Grid**: Should match GPS Sync Health numbers
3. **Fleet List**: Should not show vehicles with invalid coordinates

## Expected Results

### Before Fix
- Vehicles with lat 290 showing as "online"
- Discrepancy between GPS Sync Health and Metrics Grid
- Invalid coordinates displayed on dashboard

### After Fix
- Only vehicles with valid coordinates (lat -90 to 90, lon -180 to 180) show as "online"
- GPS Sync Health and Metrics Grid show matching numbers
- Invalid coordinates filtered out at both database and frontend levels

## Testing

1. **Check Dashboard**: Verify no vehicles with invalid coordinates appear
2. **Run Query**: Use `CHECK_INVALID_COORDINATES.sql` to see if any invalid data remains
3. **Compare Metrics**: GPS Sync Health should match Metrics Grid

## Notes

- The normalizer (`telemetry-normalizer.ts`) already validates coordinates when normalizing new data
- This fix ensures existing invalid data is filtered out
- Future data will be validated by the normalizer before insertion
- The view and frontend queries provide a double layer of protection
