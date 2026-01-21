# How to Run SQL Queries in Supabase

## Step-by-Step Guide

### Step 1: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new
2. Or: Dashboard → SQL Editor → New Query

### Step 2: Copy the Query
1. Open `VERIFY_GPS51_FIXES.sql` in your editor
2. Find Query #4 (starts at line 55)
3. Copy ONLY the SELECT statement (from `SELECT` to the semicolon `;`)

### Step 3: Paste and Run
1. Paste the query into the SQL Editor
2. Click the **"Run"** button (or press `Ctrl+Enter` / `Cmd+Enter`)
3. Wait for results

## Quick Copy-Paste for Query #4

Here's Query #4 ready to copy:

```sql
SELECT 
  COUNT(*) as total_trips,
  COUNT(DISTINCT device_id) as devices_with_trips,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) as trips_missing_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) * 100.0 / COUNT(*), 2) as missing_coords_percent,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip
FROM vehicle_trips
WHERE created_at >= NOW() - INTERVAL '7 days';
```

## What to Expect

After running, you'll see a table with:
- `total_trips` - Total number of trips in last 7 days
- `devices_with_trips` - How many devices have trips
- `avg_distance_km` - Average trip distance
- `trips_missing_coords` - Number of trips with (0,0) coordinates
- `missing_coords_percent` - Percentage missing (should be <10% after fixes)
- `earliest_trip` - Oldest trip in the period
- `latest_trip` - Newest trip in the period

## Visual Guide

```
┌─────────────────────────────────────────────────┐
│  Supabase Dashboard                             │
│                                                 │
│  [SQL Editor] ← Click here                     │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ Paste your query here                    │ │
│  │                                           │ │
│  │ SELECT COUNT(*) ...                      │ │
│  │ FROM vehicle_trips ...                   │ │
│  │                                           │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  [Run] ← Click this button                     │
│                                                 │
│  Results will appear below ↓                   │
└─────────────────────────────────────────────────┘
```

## Troubleshooting

**Error: "relation does not exist"**
- Make sure you're connected to the correct project
- Check that `vehicle_trips` table exists

**Error: "permission denied"**
- Make sure you're logged in as admin
- Or use service role key

**No results returned**
- Check the date range (last 7 days)
- Try increasing the interval: `INTERVAL '30 days'`

## Running Other Queries

To run other queries from `VERIFY_GPS51_FIXES.sql`:
1. Find the query number (Query #1, #2, etc.)
2. Copy the SELECT statement for that query
3. Paste and run in SQL Editor

Each query is separated by comments like:
```sql
-- ============================================================================
-- 1. CHECK COORDINATE COMPLETENESS
-- ============================================================================
```
