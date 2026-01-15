# Fix Trip Report Stuck on Monday - Debugging Guide

## Issue
Trips are showing up to Monday but not displaying trips after Monday in the Reports section, even though:
- ✅ Trip Activity report shows correct data (all dates)
- ✅ Database has trips from Jan 8-14
- ✅ Query should fetch 200 trips

## Debugging Steps

### Step 1: Check Browser Console Logs

Open DevTools (F12) → Console tab and look for:

1. **`[fetchVehicleTrips]` logs:**
   - How many trips received?
   - What dates are found?
   - Are trips from today/yesterday included?

2. **`[ReportsSection]` logs:**
   - How many trips received in props?
   - What dates are in the trips prop?
   - How many days are grouped?
   - What are the final grouped days?

### Step 2: Run SQL Test Query

Run `TEST_TRIP_QUERY_DIRECTLY.sql` in Supabase SQL Editor to verify:
- Are trips after Monday in the database?
- Does the query return all dates?
- Are there any trips being filtered out?

### Step 3: Check React Query Cache

The query might be cached. Try:
1. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Check if `refetchTrips()` is being called

## Possible Root Causes

### Cause 1: React Query Cache Issue
**Symptom**: Old cached data showing
**Fix**: 
- Hard refresh browser
- Check `staleTime` in `useVehicleTrips` hook
- Force refetch on mount

### Cause 2: Query Not Fetching All Trips
**Symptom**: Console shows fewer trips than expected
**Fix**: Check query limit and date filters

### Cause 3: Date Grouping Issue
**Symptom**: Trips received but not grouped correctly
**Fix**: Check date parsing logic in `groupedTrips` useMemo

### Cause 4: Trips Filtered Out
**Symptom**: Trips exist but filtered by coordinate validation
**Fix**: Check `validTrips` filter logic

## Quick Test

1. **Open browser console**
2. **Refresh vehicle profile page**
3. **Look for these logs:**
   ```
   [fetchVehicleTrips] Received X trips from database
   [fetchVehicleTrips] Unique dates found: [...]
   [ReportsSection] Trip dates in props: [...]
   [ReportsSection] Final grouped days: [...]
   ```
4. **Share the console output**

## Expected Console Output

If working correctly, you should see:
```
[fetchVehicleTrips] Received 79 trips from database
[fetchVehicleTrips] Unique dates found: ['2026-01-14', '2026-01-13', '2026-01-12', '2026-01-11', '2026-01-10', '2026-01-09', '2026-01-08']
[ReportsSection] Trip dates in props: ['2026-01-14', '2026-01-13', ...]
[ReportsSection] Final grouped days: ['Today (3 trips)', 'Yesterday (13 trips)', 'Tue, Jan 12 (22 trips)', ...]
```

## If Still Stuck

Please share:
1. **Console logs** (all `[fetchVehicleTrips]` and `[ReportsSection]` messages)
2. **Results from `TEST_TRIP_QUERY_DIRECTLY.sql`**
3. **What you see in the UI** (which dates are shown)

This will help identify if the issue is:
- Query not fetching trips
- Trips not being passed to component
- Date grouping logic
- Display/rendering issue
