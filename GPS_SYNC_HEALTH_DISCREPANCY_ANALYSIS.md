# GPS Sync Health vs Metrics Grid - Data Discrepancy Analysis

## Problem
Two different components show conflicting numbers:
- **GPS Sync Health Dashboard**: Shows 753 online, 218 moving
- **Metrics Grid**: Shows different numbers

## Root Cause Analysis

### Data Source 1: GPS Sync Health Dashboard
**Component:** `GpsSyncHealthDashboard`
**Data Source:** `v_gps_sync_health` database view

**Current Logic:**
```sql
CREATE OR REPLACE VIEW v_gps_sync_health AS
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(*) FILTER (WHERE is_online = true) as online_count,
  COUNT(*) FILTER (WHERE sync_priority = 'high') as moving_count,  -- ISSUE HERE
  ...
FROM vehicle_positions;
```

**Problems:**
1. **Moving Count**: Uses `sync_priority = 'high'` which is set when `speed > 3 km/h` (from telemetry-normalizer)
2. **Online Count**: Counts ALL vehicles with `is_online = true`, including those without valid GPS coordinates

### Data Source 2: Metrics Grid
**Component:** `MetricCard` (via `useFleetData` hook)
**Data Source:** `vehicle_positions` table (direct query)

**Current Logic:**
```typescript
// From useFleetData.ts
function calculateMetrics(vehicles: FleetVehicle[]): FleetMetrics {
  const movingVehicles = vehicles.filter(v => v.status === 'moving');
  const onlineVehicles = vehicles.filter(v => v.status !== 'offline');
  ...
}

// Status calculation:
// status = 'moving' if: speed > 0 && is_online === true && hasValidCoords
// status = 'offline' if: is_online === false
// status = 'stopped' if: speed === 0 && is_online === true && hasValidCoords
```

**Logic:**
1. **Moving Count**: Counts vehicles where `speed > 0` (not > 3 km/h)
2. **Online Count**: Counts vehicles where `status !== 'offline'`, which requires:
   - `is_online === true` AND
   - Valid coordinates (lat/lon not null and not 0,0)

## The Discrepancy

### Online Count Difference:
- **GPS Sync Health**: 753 (all vehicles with `is_online = true`)
- **Metrics Grid**: Lower number (only vehicles with `is_online = true` AND valid coordinates)

**Reason:** Some vehicles may have `is_online = true` but invalid/missing GPS coordinates.

### Moving Count Difference:
- **GPS Sync Health**: 218 (vehicles with `sync_priority = 'high'`, i.e., speed > 3 km/h)
- **Metrics Grid**: Different number (vehicles with `speed > 0`)

**Reason:** 
- GPS Sync Health uses threshold of **3 km/h** (to filter out GPS drift/noise)
- Metrics Grid uses threshold of **0 km/h** (any movement counts)

## Recommended Solution

### Option 1: Fix the View to Match Frontend Logic (Recommended)
Update `v_gps_sync_health` view to use the same logic as the frontend:

```sql
CREATE OR REPLACE VIEW v_gps_sync_health AS
SELECT 
  COUNT(*) as total_vehicles,
  -- Online: is_online = true AND has valid coordinates
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND NOT (latitude = 0 AND longitude = 0)
  ) as online_count,
  -- Moving: speed > 0 (matches frontend logic)
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND NOT (latitude = 0 AND longitude = 0)
    AND speed > 0
  ) as moving_count,
  COUNT(*) FILTER (WHERE cached_at < now() - interval '5 minutes') as stale_count,
  MIN(cached_at) as oldest_sync,
  MAX(cached_at) as newest_sync,
  ROUND(AVG(EXTRACT(EPOCH FROM (now() - cached_at)))::numeric, 1) as avg_age_seconds
FROM vehicle_positions;
```

### Option 2: Update Frontend to Match View Logic
Change `useFleetData` to use `speed > 3` for moving count, but this would be less accurate for showing "moving now".

### Option 3: Add Both Metrics
Show both definitions:
- "Moving (>3 km/h)" - from sync_priority
- "Moving (>0 km/h)" - from frontend logic

## Recommendation

**Use Option 1** - Update the view to match frontend logic because:
1. Frontend logic is more intuitive (any speed > 0 = moving)
2. Consistency across the dashboard
3. Users expect "Moving Now" to show all vehicles in motion, not just those > 3 km/h
4. The 3 km/h threshold is for sync priority (optimization), not for user-facing metrics

## Implementation

Create a migration to update the view:

```sql
-- Fix v_gps_sync_health to match frontend metrics logic
CREATE OR REPLACE VIEW v_gps_sync_health AS
SELECT 
  COUNT(*) as total_vehicles,
  -- Online: is_online = true AND has valid GPS coordinates
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND NOT (latitude = 0 AND longitude = 0)
  ) as online_count,
  -- Moving: speed > 0 AND online AND has valid coordinates (matches frontend)
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND NOT (latitude = 0 AND longitude = 0)
    AND speed > 0
  ) as moving_count,
  -- Stale: data older than 5 minutes
  COUNT(*) FILTER (WHERE cached_at < now() - interval '5 minutes') as stale_count,
  MIN(cached_at) as oldest_sync,
  MAX(cached_at) as newest_sync,
  ROUND(AVG(EXTRACT(EPOCH FROM (now() - cached_at)))::numeric, 1) as avg_age_seconds
FROM vehicle_positions;
```

This will ensure both components show the same numbers.
