# Trip Report Bug Fix - Trips Stuck at Monday

## Issue
Trips are showing up to Monday but not displaying trips after Monday in the vehicle profile page.

## Fixes Applied

### 1. Increased Trip Limit
- Changed default limit from `50` to `200` trips
- This ensures we fetch more recent trips

### 2. Removed Automatic Date Filter
- Removed the automatic 30-day filter when no date range is specified
- Now fetches latest trips without date restrictions

### 3. Improved Cache Invalidation
- Added explicit cache removal on refresh
- Added better query invalidation

### 4. Added Debugging Logs
- Console logs in `fetchVehicleTrips` to see what's being queried
- Console logs in `ReportsSection` to see what dates are found
- This will help diagnose if the issue is:
  - Query not fetching trips
  - Trips not in database
  - Date grouping issue

## Debugging Steps

### Step 1: Check Browser Console
1. Open browser DevTools (F12)
2. Go to Console tab
3. Refresh the vehicle profile page
4. Look for logs:
   - `[fetchVehicleTrips] Fetching trips...`
   - `[fetchVehicleTrips] Received X trips from database`
   - `[fetchVehicleTrips] Trip date range: ...`
   - `[ReportsSection] Trip dates found: ...`

### Step 2: Check Database
Run the debug query in Supabase SQL Editor:
```sql
-- See DEBUG_TRIP_QUERY.sql for full diagnostic queries
```

Check:
- Are there trips after Monday in the database?
- What dates do the trips have?
- Are the trips valid (have coordinates)?

### Step 3: Force Sync
1. Click the "Sync" button in Reports section
2. Wait for sync to complete
3. Pull down to refresh
4. Check if trips appear

## Possible Root Causes

### Cause 1: Trips Not Synced Yet
**Symptom**: Trips after Monday don't exist in database
**Fix**: Run sync via "Sync" button or edge function

### Cause 2: Query Caching
**Symptom**: Old cached data showing
**Fix**: Pull to refresh or clear browser cache

### Cause 3: Date Filter Issue
**Symptom**: Query has wrong date filter
**Fix**: Check console logs to see if date filter is applied incorrectly

### Cause 4: Trip Data Invalid
**Symptom**: Trips exist but filtered out due to invalid coordinates
**Fix**: Check if trips have valid lat/lon values

## Test After Fix

1. **Clear browser cache** and refresh
2. **Check console logs** to see what trips are fetched
3. **Run sync** to ensure latest trips are synced
4. **Pull down to refresh** to force new data fetch

## Next Steps if Still Not Working

1. Share console logs showing:
   - `[fetchVehicleTrips]` messages
   - `[ReportsSection]` messages
2. Run `DEBUG_TRIP_QUERY.sql` and share results
3. Check if trips after Monday exist in database
