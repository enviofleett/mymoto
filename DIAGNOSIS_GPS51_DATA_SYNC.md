# GPS51 Data Sync Diagnosis & Implementation Plan

## Executive Summary

The dashboard is NOT displaying the exact same data as GPS51 platform for trip reports, mileage reports, and alarm reports. This document explains **why** and provides the **simplest solution** to achieve 100% data accuracy.

---

## Root Cause Analysis

### Problem: Two Conflicting Data Sources

The dashboard currently uses **TWO different data sources**:

1. **GPS51 API** (External Source of Truth) - What GPS51 platform shows
2. **Local Database Calculations** (position_history table) - What dashboard computes internally

These two sources produce **different results** because they use different algorithms and timing.

---

## Detailed Discrepancy Analysis

### 1. Trip Reports Discrepancy

#### GPS51 Source (Ground Truth)
- **API**: `querytrips`
- **Location**: Section 6 of GPS51 API documentation
- **How it works**: GPS51 calculates trips using its own proprietary logic:
  - ACC status changes
  - Time gaps between positions
  - Distance thresholds
  - GPS51's internal state machine
- **Data fields**: `starttime`, `endtime`, `distance`, `maxspeed`, `avgspeed`, coordinates

#### Dashboard Current Implementation
- **Source**: `vehicle_trips` VIEW (generates trips from `position_history`)
- **File**: `supabase/migrations/20260109120000_vehicle_trips_and_analytics.sql`
- **How it works**: SQL view that:
  - Detects ignition state changes (ON → OFF)
  - Groups consecutive positions
  - Calculates distance using Haversine formula
- **Display**: `src/components/fleet/VehicleTrips.tsx`

#### Why They Differ
| Aspect | GPS51 | Dashboard |
|--------|-------|-----------|
| **Trip Start** | ACC ON + GPS51 logic | Ignition ON detected in position_history |
| **Trip End** | ACC OFF + time gap + GPS51 logic | Ignition OFF detected in position_history |
| **Distance** | Accumulated path distance (more accurate) | Straight-line Haversine between points |
| **Filtering** | GPS51's internal filters | 100m minimum distance, 100m start-end distance |
| **Timing** | Real-time on device | Depends on position sync timing |

**Result**: Different trip counts, different distances, different start/end times.

---

### 2. Mileage Reports Discrepancy

#### GPS51 Source (Ground Truth)
- **API**: `reportmileagedetail`
- **Location**: Section 4.2 of GPS51 API documentation
- **How it works**: GPS51 calculates daily mileage statistics including:
  - `totaldistance` - Total meters driven
  - `oilper100km` - Actual fuel consumption (measured by device)
  - `begindis`/`enddis` - Odometer start/end
  - `totalacc` - Total ACC-on time
  - `leakoil` - Fuel theft detection

#### Dashboard Current Implementation
- **Source**: Mixed sources:
  1. `vehicle_mileage_details` table (✅ Synced from GPS51) - for fuel consumption
  2. `vehicle_trips` VIEW (❌ Local calculation) - for trip counts and distances
- **File**: `src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx`
- **How it works**:
  - Lines 68-86: Uses `deriveMileageFromStats()` which calculates from `dailyStats`
  - `dailyStats` comes from `get_daily_mileage()` function which uses `vehicle_trips` VIEW
  - Mixed data: GPS51 fuel consumption + local trip calculations

#### Why They Differ
| Metric | GPS51 | Dashboard |
|--------|-------|-----------|
| **Distance** | GPS51's calculated total | Sum of `vehicle_trips` VIEW distances |
| **Trip Count** | GPS51's trip detection | `vehicle_trips` VIEW trip count |
| **ACC Time** | GPS51 measured (ms) | Not displayed consistently |
| **Fuel Data** | ✅ Direct from GPS51 | ✅ Direct from GPS51 (correct) |

**Result**: Mileage totals may differ, trip counts differ, partially correct data.

---

### 3. Alarm Reports Discrepancy

#### GPS51 Source (Ground Truth)
- **API**: Embedded in position data (no dedicated alarm API)
- **Location**: Section 4.1 `lastposition` API response
- **Data fields**:
  - `alarm` (long) - Alarm code (JT808 protocol)
  - `stralarm` (String) - Alarm description
  - `stralarmsen` (String) - Alarm description in English
  - Examples: Overspeed, SOS, crash, geofence, fuel theft, etc.

#### Dashboard Current Implementation
- **Source**: `proactive_vehicle_events` table
- **File**: `src/hooks/useVehicleAlerts.ts`
- **How it works**:
  - Events are created by LOCAL triggers (not GPS51 sync)
  - File: `supabase/migrations/20260110063018_a423418d-6419-48ee-8806-d9c6e9387615.sql`
  - Events generated from dashboard's own detection logic
- **Sync Status**: ❌ **NO SYNC FROM GPS51**

#### Why They Differ
| Aspect | GPS51 | Dashboard |
|--------|-------|-----------|
| **Data Source** | Device reports alarms via JT808 protocol | Dashboard generates events from local rules |
| **Alarm Types** | All JT808 alarm types | Only dashboard-detected events |
| **Timing** | Real-time from device | Depends on local processing |
| **Sync** | GPS51 receives directly from device | ❌ Never synced from GPS51 |

**Result**: 100% different alarm data. Dashboard shows its own events, not GPS51 alarms.

---

## Implementation Plan (Simplest Solution)

### Goal: 100% Match with GPS51 Platform

### Approach: Direct GPS51 Data Sync

Instead of calculating data locally, we will:
1. ✅ Fetch data directly from GPS51 APIs
2. ✅ Store it in dedicated tables
3. ✅ Display it without modification

---

### Solution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         GPS51 Platform                          │
│  (Single Source of Truth)                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Direct API Calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Edge Functions                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ sync-gps51-   │  │ sync-gps51-   │  │ sync-gps51-   │       │
│  │ trips         │  │ mileage       │  │ alarms        │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Insert directly (no transformations)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Database                           │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ gps51_trips   │  │ vehicle_      │  │ gps51_alarms  │       │
│  │ (NEW)         │  │ mileage_      │  │ (NEW)         │       │
│  │               │  │ details       │  │               │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Query directly (no calculations)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vehicle Profile Page                          │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ VehicleTrips  │  │ MileageSection│  │ VehicleAlerts │       │
│  │ (UPDATED)     │  │ (UPDATED)     │  │ (UPDATED)     │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

### Implementation Steps

#### Step 1: Create Database Tables

**File**: `supabase/migrations/20260124000000_create_gps51_sync_tables.sql`

```sql
-- Table 1: GPS51 Trips (exact data from querytrips API)
CREATE TABLE gps51_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,

  -- Trip timing (from GPS51)
  start_time timestamptz NOT NULL,
  end_time timestamptz,

  -- Trip coordinates (from GPS51)
  start_latitude numeric,
  start_longitude numeric,
  end_latitude numeric,
  end_longitude numeric,

  -- Trip metrics (from GPS51)
  distance_meters integer, -- GPS51's calculated distance
  distance_km numeric GENERATED ALWAYS AS (distance_meters / 1000.0) STORED,
  avg_speed_kmh numeric, -- GPS51's calculated average speed
  max_speed_kmh numeric, -- GPS51's calculated max speed

  -- Metadata
  gps51_trip_id text, -- GPS51's internal trip ID (if provided)
  synced_at timestamptz DEFAULT now(),

  -- Constraints
  UNIQUE(device_id, start_time, distance_meters)
);

-- Table 2: GPS51 Alarms (extracted from position data)
CREATE TABLE gps51_alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,

  -- Alarm data (from GPS51)
  alarm_code bigint NOT NULL,
  alarm_description text,
  alarm_description_en text,

  -- Position when alarm occurred
  latitude numeric,
  longitude numeric,
  speed_kmh numeric,

  -- Timing
  alarm_time timestamptz NOT NULL,
  synced_at timestamptz DEFAULT now(),

  -- Metadata
  raw_alarm_data jsonb, -- Store full alarm context

  -- Constraints
  UNIQUE(device_id, alarm_time, alarm_code)
);
```

#### Step 2: Create Sync Edge Functions

**File**: `supabase/functions/sync-gps51-trips/index.ts`

```typescript
// Fetch trips directly from GPS51 querytrips API
// Store in gps51_trips table WITHOUT any transformations
// Match GPS51 platform 100%
```

**File**: `supabase/functions/sync-gps51-alarms/index.ts`

```typescript
// Fetch position history with alarm data
// Extract alarm fields
// Store in gps51_alarms table
```

#### Step 3: Update Frontend Components

**File**: `src/components/fleet/VehicleTrips.tsx`

```typescript
// BEFORE: Fetches from vehicle_trips VIEW (local calculation)
const { data } = await supabase.from('vehicle_trips').select('*')

// AFTER: Fetches from gps51_trips table (GPS51 data)
const { data } = await supabase.from('gps51_trips').select('*')
```

**File**: `src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx`

```typescript
// BEFORE: Uses deriveMileageFromStats() which calculates from dailyStats
const derivedStats = deriveMileageFromStats(dailyStats)

// AFTER: Uses vehicle_mileage_details directly (already GPS51 data)
const { data } = await supabase.from('vehicle_mileage_details').select('*')
```

**File**: `src/hooks/useVehicleAlerts.ts`

```typescript
// BEFORE: Fetches from proactive_vehicle_events (local events)
const { data } = await supabase.from('proactive_vehicle_events').select('*')

// AFTER: Fetches from gps51_alarms (GPS51 alarms)
const { data } = await supabase.from('gps51_alarms').select('*')
```

#### Step 4: Setup Automatic Syncing

**File**: `supabase/migrations/20260124000001_setup_gps51_sync_cron.sql`

```sql
-- Sync GPS51 trips every 10 minutes
SELECT cron.schedule(
  'sync-gps51-trips',
  '*/10 * * * *',
  $$SELECT net.http_post(...) WHERE ...$$
);

-- Sync GPS51 alarms every 5 minutes
SELECT cron.schedule(
  'sync-gps51-alarms',
  '*/5 * * * *',
  $$SELECT net.http_post(...) WHERE ...$$
);
```

---

## Expected Results

### Before Implementation
- ❌ Trip counts differ between dashboard and GPS51
- ❌ Trip distances differ (Haversine vs GPS51's path distance)
- ❌ Mileage totals differ (mixed data sources)
- ❌ Alarms are 100% different (no sync)

### After Implementation
- ✅ Trip data matches GPS51 platform 100%
- ✅ Mileage data matches GPS51 platform 100%
- ✅ Alarm data matches GPS51 platform 100%
- ✅ All data synced automatically every 5-10 minutes
- ✅ No local calculations, only GPS51 data display

---

## Files to be Created/Modified

### New Files
1. `supabase/migrations/20260124000000_create_gps51_sync_tables.sql`
2. `supabase/migrations/20260124000001_setup_gps51_sync_cron.sql`
3. `supabase/functions/sync-gps51-trips/index.ts`
4. `supabase/functions/sync-gps51-alarms/index.ts`

### Modified Files
1. `src/components/fleet/VehicleTrips.tsx` - Switch to gps51_trips table
2. `src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx` - Use GPS51 data exclusively
3. `src/hooks/useVehicleAlerts.ts` - Switch to gps51_alarms table

---

## GPS51 API Endpoints Used

### 1. querytrips (Trip Report)
- **Section**: 6 of GPS51 API documentation
- **Parameters**:
  - `deviceid`: Device ID
  - `begintime`: Start time (yyyy-MM-dd HH:mm:ss)
  - `endtime`: End time (yyyy-MM-dd HH:mm:ss)
  - `timezone`: 8 (GMT+8)
- **Returns**: List of trips with start/end times, coordinates, distance, speeds

### 2. reportmileagedetail (Mileage Report)
- **Section**: 4.2 of GPS51 API documentation
- **Parameters**:
  - `deviceid`: Device ID
  - `startday`: Start date (yyyy-MM-dd)
  - `endday`: End date (yyyy-MM-dd)
  - `offset`: 8 (timezone)
- **Returns**: Daily mileage with fuel consumption, ACC time, distances

### 3. lastposition (For Alarms)
- **Section**: 4.1 of GPS51 API documentation
- **Parameters**:
  - `deviceids`: List of device IDs
  - `lastquerypositiontime`: Last query time (for incremental sync)
- **Returns**: Position data with alarm fields (`alarm`, `stralarm`, `stralarmsen`)

---

## Validation & Testing

### Test Scenario 1: Trip Report Match
1. Open GPS51 platform → View trip report for vehicle X on date Y
2. Open dashboard → View trip report for vehicle X on date Y
3. **Expected**: Exact same trips, distances, times

### Test Scenario 2: Mileage Report Match
1. Open GPS51 platform → View mileage report for vehicle X (last 7 days)
2. Open dashboard → View mileage report for vehicle X (last 7 days)
3. **Expected**: Exact same distances, fuel consumption, ACC time

### Test Scenario 3: Alarm Report Match
1. Open GPS51 platform → View alarm history for vehicle X
2. Open dashboard → View alarms for vehicle X
3. **Expected**: Exact same alarms, times, descriptions

---

## Implementation Timeline

- **Step 1**: Create database tables (5 minutes)
- **Step 2**: Create sync-gps51-trips function (20 minutes)
- **Step 3**: Create sync-gps51-alarms function (15 minutes)
- **Step 4**: Update frontend components (15 minutes)
- **Step 5**: Setup cron jobs (5 minutes)
- **Step 6**: Testing and validation (15 minutes)

**Total**: ~75 minutes

---

## Cursor Validation Prompt

After implementation, use this prompt in Cursor to verify 100% accuracy:

```
Verify that the GPS51 data sync implementation is 100% accurate by checking:

1. Database Tables:
   - Confirm gps51_trips table stores exact data from GPS51 querytrips API
   - Confirm gps51_alarms table stores exact data from GPS51 position alarms
   - Confirm no data transformations occur during storage

2. Edge Functions:
   - Confirm sync-gps51-trips calls querytrips API and stores raw data
   - Confirm sync-gps51-alarms extracts alarm fields from lastposition API
   - Confirm no calculations or derivations in sync functions

3. Frontend Components:
   - Confirm VehicleTrips.tsx fetches from gps51_trips (not vehicle_trips view)
   - Confirm MileageSection.tsx uses GPS51 data only (no deriveMileageFromStats)
   - Confirm useVehicleAlerts.ts fetches from gps51_alarms (not proactive_vehicle_events)

4. Data Flow:
   - Trace data flow from GPS51 API → Edge Function → Database → Frontend
   - Confirm no intermediate transformations or calculations
   - Confirm 1:1 mapping of GPS51 fields to database columns

5. Test Cases:
   - Compare trip report data: dashboard vs GPS51 platform
   - Compare mileage report data: dashboard vs GPS51 platform
   - Compare alarm report data: dashboard vs GPS51 platform
   - All three must match 100%

Report any discrepancies or deviations from GPS51 source data.
```

---

## Conclusion

The root cause of data discrepancies is **dual data sources**: GPS51 API vs local calculations from position_history.

The solution is **simple**: fetch data directly from GPS51 APIs, store it without transformations, and display it without calculations. This ensures 100% accuracy with GPS51 platform.
