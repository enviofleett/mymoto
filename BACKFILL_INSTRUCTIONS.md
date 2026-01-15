# Backfill Trip Coordinates - Instructions

## Problem
Trips have `0,0` coordinates because GPS51's `querytrips` API sometimes doesn't return coordinates.

## Solution
We need to backfill coordinates from the `position_history` table.

## Method 1: Simple Script (Recommended - Less Likely to Timeout)

1. **Run `BACKFILL_TRIP_COORDINATES_SIMPLE.sql`** in Supabase SQL Editor
2. **Repeat** until the progress check shows no more missing coordinates
3. Each run processes 50 trips at a time

### How to know when done:
After each run, check the progress:
```sql
SELECT 
  COUNT(*) as total_trips,
  COUNT(CASE WHEN start_latitude = 0 OR start_longitude = 0 THEN 1 END) as missing_start_coords,
  COUNT(CASE WHEN end_latitude = 0 OR end_longitude = 0 THEN 1 END) as missing_end_coords
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= '2026-01-08 00:00:00+00';
```

When `missing_start_coords` and `missing_end_coords` are both `0`, you're done!

## Method 2: Optimized Script (Faster but may still timeout)

1. **Run `BACKFILL_TRIP_COORDINATES_OPTIMIZED.sql`** in Supabase SQL Editor
2. **Repeat** if it times out
3. Each run processes 100 trips at a time

## Method 3: Manual Backfill via Edge Function

Instead of SQL, you can trigger the sync function which now automatically backfills coordinates:

1. Go to vehicle profile page
2. Click "Sync" button
3. The updated sync function will backfill coordinates for new trips

## Why the timeout?

The original query was trying to process all trips at once with complex subqueries. The optimized versions:
- Process trips in small batches (50-100 at a time)
- Use simpler queries
- Have LIMIT clauses to prevent full table scans

## After Backfilling

Once coordinates are backfilled:
- Trips will show addresses instead of "Location data unavailable"
- Mapbox API will work correctly
- Distance calculations will be accurate
