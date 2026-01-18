# Fix Live Fleet Activity Timeout

## Problem
The `position_history` table query was timing out (500 error) because it was trying to scan the entire table without a time filter.

## Solution
Added a time filter to only fetch data from the last 24 hours, which:
1. Uses the existing index `idx_position_history_device_time` for fast queries
2. Reduces the dataset size dramatically
3. Still shows recent activity (24 hours is plenty for "Live" activity)

## Changes Made

### 1. Added Time Filter
```typescript
const recentCutoff = new Date();
recentCutoff.setHours(recentCutoff.getHours() - 24);

query = query.gte('gps_time', recentCutoff.toISOString())
```

### 2. Query Order
The query now:
1. Filters by time first (uses index)
2. Filters by device_id if provided (uses composite index)
3. Filters null coordinates
4. Orders by gps_time DESC
5. Limits results

## Index Used
The query uses the existing index:
- `idx_position_history_device_time ON position_history(device_id, gps_time DESC)`

This index makes time-based queries very fast.

## Fallback
If `position_history` has no recent data, the component falls back to `vehicle_positions` which shows current vehicle states.

## Testing
After this fix:
- Query should complete in < 1 second
- Only shows activity from last 24 hours
- No more timeout errors
- Console logs show: `[RecentActivityFeed] Fetched X position records`
