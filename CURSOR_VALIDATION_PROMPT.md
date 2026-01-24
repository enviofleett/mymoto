# Cursor AI Validation Prompt

## Objective
Verify that the GPS51 data sync implementation is 100% accurate and matches the GPS51 platform exactly for trip reports, mileage reports, and alarm reports.

---

## Instructions for Cursor AI

Please perform a comprehensive code review and validation of the GPS51 data sync implementation by checking the following:

### 1. Database Schema Validation

#### Task 1.1: Verify GPS51 Sync Tables
Check the migration file: `supabase/migrations/20260124000000_create_gps51_sync_tables.sql`

Verify:
- [ ] Table `gps51_trips` exists with correct schema
- [ ] Table `gps51_alarms` exists with correct schema
- [ ] Table `gps51_sync_status` exists with correct schema
- [ ] All required indexes are created
- [ ] RLS policies are correctly configured
- [ ] Helper functions are defined and granted correct permissions

**Critical Check**: Confirm that `distance_km` in `gps51_trips` is a GENERATED column from `distance_meters` (not calculated by the app).

#### Task 1.2: Verify Column Mappings
Check that database columns match GPS51 API fields exactly:

**gps51_trips table**:
- `distance_meters` ← GPS51 `distance` or `totaldistance` field (NO Haversine calculation)
- `avg_speed_kmh` ← GPS51 `avgspeed` field converted from m/h to km/h
- `max_speed_kmh` ← GPS51 `maxspeed` field converted from m/h to km/h
- `start_time` ← GPS51 `starttime` or `starttime_str` field
- `end_time` ← GPS51 `endtime` or `endtime_str` field

**gps51_alarms table**:
- `alarm_code` ← GPS51 `alarm` field
- `alarm_description` ← GPS51 `stralarm` field
- `alarm_description_en` ← GPS51 `stralarmsen` field
- `alarm_time` ← GPS51 `updatetime` or `validpoistiontime` field

Report any mismatches or deviations.

---

### 2. Edge Function Validation

#### Task 2.1: Verify sync-gps51-trips Function
Check the file: `supabase/functions/sync-gps51-trips/index.ts`

Verify:
- [ ] Calls GPS51 `querytrips` API (Section 6 of API documentation)
- [ ] NO distance calculations (uses GPS51's distance field directly)
- [ ] NO speed normalization beyond unit conversion (m/h → km/h)
- [ ] NO trip filtering (accepts all trips from GPS51)
- [ ] Stores complete GPS51 response in `gps51_raw_data` column
- [ ] Uses UPSERT with conflict on `device_id, start_time`
- [ ] Updates `gps51_sync_status` table after sync

**Critical Check**: Confirm there are NO calls to Haversine distance functions or `calculateDistance()`.

**Critical Check**: Confirm `convertGps51TripToDb()` function does NOT add, modify, or filter any data beyond unit conversions.

#### Task 2.2: Verify sync-gps51-alarms Function
Check the file: `supabase/functions/sync-gps51-alarms/index.ts`

Verify:
- [ ] Calls GPS51 `lastposition` API (Section 4.1 of API documentation)
- [ ] Extracts alarm fields: `alarm`, `stralarm`, `stralarmsen`, `videoalarm`
- [ ] Only stores records where `alarm` code > 0 (actual alarms)
- [ ] Stores position coordinates at time of alarm
- [ ] Determines severity based on alarm description
- [ ] Stores complete position data in `gps51_raw_data` column
- [ ] Uses UPSERT with conflict on `device_id, alarm_time, alarm_code`

**Critical Check**: Confirm no alarms are filtered out except `alarm_code = 0`.

---

### 3. Frontend Component Validation

#### Task 3.1: Verify VehicleTrips Component
Check the file: `src/components/fleet/VehicleTrips.tsx`

Verify:
- [ ] Fetches from `gps51_trips` table (NOT `vehicle_trips` view)
- [ ] Query key is `'gps51-trips'` (NOT `'vehicle-trips'`)
- [ ] NO distance calculations in the component (uses `trip.distance_km` directly)
- [ ] NO speed normalization in the component (uses GPS51 speeds directly)
- [ ] NO trip filtering beyond invalid coordinates

**Critical Check**: Search for any calls to `calculateDistance()` - there should be NONE in the trip mapping logic.

**Before Implementation**:
```typescript
.from('vehicle_trips')  // ❌ Wrong table
.map((trip) => {
  let distanceKm = trip.distance_km || 0;
  if (distanceKm === 0 && hasValidCoords) {
    distanceKm = calculateDistance(...);  // ❌ Calculation
  }
})
```

**After Implementation**:
```typescript
.from('gps51_trips')  // ✅ Correct table
.map((trip) => {
  return {
    distance_km: trip.distance_km || 0,  // ✅ GPS51 data directly
  };
})
```

#### Task 3.2: Verify MileageSection Component
Check the file: `src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx`

Verify:
- [ ] Uses `vehicle_mileage_details` table (synced from GPS51)
- [ ] NO calls to `deriveMileageFromStats()` for trip counts or distances
- [ ] Displays GPS51 fuel consumption data directly
- [ ] Shows `oilper100km` as actual fuel consumption from GPS51

**Note**: Mileage section may still use `dailyStats` for display purposes, but the SOURCE of dailyStats should be `vehicle_mileage_details`, not `vehicle_trips` view.

#### Task 3.3: Verify useVehicleAlerts Hook
Check the file: `src/hooks/useVehicleAlerts.ts`

Verify:
- [ ] Fetches from `gps51_alarms` table (NOT `proactive_vehicle_events`)
- [ ] Query key is `'gps51-alarms'` (NOT `'vehicle-alerts'`)
- [ ] Transforms GPS51 alarm data to `VehicleAlert` interface
- [ ] Uses `alarm_time` for sorting (NOT `created_at`)
- [ ] Includes `alarm_code` in metadata

**Before Implementation**:
```typescript
.from('proactive_vehicle_events')  // ❌ Wrong table
.order('created_at', { ascending: false })  // ❌ Wrong time field
```

**After Implementation**:
```typescript
.from('gps51_alarms')  // ✅ Correct table
.order('alarm_time', { ascending: false })  // ✅ Correct GPS51 time field
```

---

### 4. Data Flow Validation

#### Task 4.1: Trace Trip Data Flow
Trace the complete data flow from GPS51 API to frontend display:

1. **GPS51 API** (`querytrips`)
   - Returns: `distance`, `avgspeed`, `maxspeed`, `starttime`, `endtime`
2. **Edge Function** (`sync-gps51-trips`)
   - Converts: m/h → km/h (speed only)
   - Stores: `distance_meters`, `avg_speed_kmh`, `max_speed_kmh`
   - NO other transformations
3. **Database** (`gps51_trips` table)
   - Stores: Raw data from step 2
   - Generates: `distance_km` = `distance_meters / 1000`
4. **Frontend** (`VehicleTrips.tsx`)
   - Displays: `distance_km`, `avg_speed_kmh`, `max_speed_kmh` directly
   - NO calculations

**Verification Question**: Is there ANY point in this flow where data is calculated, filtered, or modified beyond unit conversions?
**Expected Answer**: NO

#### Task 4.2: Trace Alarm Data Flow
Trace the complete data flow from GPS51 API to frontend display:

1. **GPS51 API** (`lastposition`)
   - Returns: `alarm`, `stralarm`, `stralarmsen`, `updatetime`
2. **Edge Function** (`sync-gps51-alarms`)
   - Extracts: Alarm fields if `alarm > 0`
   - Stores: Exact GPS51 fields
   - NO filtering except `alarm_code = 0`
3. **Database** (`gps51_alarms` table)
   - Stores: Raw alarm data from step 2
4. **Frontend** (`useVehicleAlerts.ts`)
   - Displays: Alarm description, time, code directly
   - NO calculations

**Verification Question**: Is there ANY point in this flow where alarms are filtered out beyond `alarm_code = 0`?
**Expected Answer**: NO

---

### 5. Cron Job Validation

#### Task 5.1: Verify Cron Job Configuration
Check the file: `supabase/migrations/20260124000001_setup_gps51_sync_cron.sql`

Verify:
- [ ] Cron job `sync-gps51-trips-all-vehicles` runs every 10 minutes
- [ ] Cron job `sync-gps51-alarms-all-vehicles` runs every 5 minutes
- [ ] Cron jobs call correct Edge Functions with correct parameters
- [ ] Manual trigger functions exist for testing

**Critical Check**: Confirm cron jobs use `net.http_post` to call Edge Functions (NOT direct SQL).

---

### 6. No Transformation Validation

#### Task 6.1: Search for Prohibited Operations
Search the codebase for these patterns and confirm they are NOT used for GPS51 data:

**Prohibited Patterns**:
```typescript
// ❌ Should NOT exist for GPS51 trips
calculateDistance(lat1, lon1, lat2, lon2)

// ❌ Should NOT exist for GPS51 trips
trip.distance_km = 0 && hasValidCoords ? calculateDistance(...) : trip.distance_km

// ❌ Should NOT exist for GPS51 data
normalizeSpeed(trip.speed)

// ❌ Should NOT exist for GPS51 data
deriveMileageFromStats(dailyStats)

// ❌ Should NOT exist for GPS51 trips
if (trip.distance < MIN_DISTANCE) continue; // Filtering trips

// ❌ Should NOT exist for GPS51 alarms
if (alarm.severity !== 'critical') continue; // Filtering alarms
```

**Report**: List any occurrences of these patterns in GPS51-related code.

---

### 7. Code Quality Validation

#### Task 7.1: Type Safety
Verify:
- [ ] All GPS51 data fields have proper TypeScript types
- [ ] No `any` types in GPS51 data handling code
- [ ] Database columns match TypeScript interfaces

#### Task 7.2: Error Handling
Verify:
- [ ] Edge Functions handle GPS51 API errors gracefully
- [ ] Sync status is updated on errors
- [ ] Frontend displays error states properly

#### Task 7.3: Performance
Verify:
- [ ] Indexes exist on all query columns
- [ ] Queries use `LIMIT` to prevent loading too much data
- [ ] No N+1 query problems

---

## Final Validation Checklist

Please confirm the following statements are TRUE:

### Database Layer
- [ ] `gps51_trips` table stores GPS51 data without transformations
- [ ] `gps51_alarms` table stores GPS51 alarms without filtering
- [ ] `distance_km` is a GENERATED column (not calculated by app)
- [ ] All indexes and RLS policies are correctly configured

### Edge Functions
- [ ] `sync-gps51-trips` calls GPS51 `querytrips` API directly
- [ ] `sync-gps51-alarms` calls GPS51 `lastposition` API directly
- [ ] NO distance calculations in sync functions
- [ ] NO trip/alarm filtering beyond basic validation
- [ ] Complete GPS51 responses are stored in `gps51_raw_data`

### Frontend Components
- [ ] `VehicleTrips.tsx` fetches from `gps51_trips` (not `vehicle_trips`)
- [ ] `useVehicleAlerts.ts` fetches from `gps51_alarms` (not `proactive_vehicle_events`)
- [ ] NO distance calculations in trip display
- [ ] NO alarm filtering in frontend

### Data Flow
- [ ] Trip data flows GPS51 → Edge Function → DB → Frontend with ONLY unit conversions
- [ ] Alarm data flows GPS51 → Edge Function → DB → Frontend with NO modifications
- [ ] Mileage data flows GPS51 → DB → Frontend with NO calculations

### Automation
- [ ] Cron jobs are configured to sync every 5-10 minutes
- [ ] Manual trigger functions exist for testing
- [ ] Sync status is tracked in `gps51_sync_status` table

---

## Expected Output

After reviewing the code, please provide:

1. **Confirmation Statement**: "The GPS51 data sync implementation is 100% accurate" OR "Issues found"

2. **Issues Found** (if any):
   - File path
   - Line number
   - Issue description
   - Suggested fix

3. **Data Flow Diagram**: Describe the actual data flow you observed for trips and alarms

4. **Transformation Report**: List any data transformations beyond unit conversions

5. **Performance Assessment**: Comment on query performance and index usage

---

## Success Criteria

The implementation is **100% ACCURATE** if:
✅ All checklist items are checked
✅ Zero issues found
✅ Data flows directly from GPS51 to display without calculations
✅ Trip/alarm counts match GPS51 platform exactly
✅ No prohibited transformation patterns exist

---

## Example Expected Response

```markdown
# Validation Report

## Status: ✅ 100% ACCURATE

### Confirmation
The GPS51 data sync implementation is 100% accurate. All data flows directly from GPS51 APIs to the frontend without transformations beyond unit conversions.

### Data Flow Verification
**Trips**: GPS51 querytrips → sync-gps51-trips → gps51_trips → VehicleTrips.tsx
- No distance calculations
- No trip filtering
- Speed conversion: m/h → km/h only

**Alarms**: GPS51 lastposition → sync-gps51-alarms → gps51_alarms → useVehicleAlerts.ts
- No alarm filtering (except alarm_code = 0)
- No modifications

**Mileage**: GPS51 reportmileagedetail → vehicle_mileage_details → MileageSection.tsx
- No calculations
- Direct display

### Checklist
[x] All database tables correct
[x] All edge functions correct
[x] All frontend components correct
[x] No prohibited transformations found
[x] Cron jobs configured correctly

### Issues Found
None

### Performance
All queries use indexes. Estimated query time < 50ms.

### Conclusion
Implementation matches GPS51 platform 100%. Ready for production.
```

---

## Usage Instructions

1. Copy this entire prompt
2. Paste into Cursor AI chat
3. Cursor will analyze the codebase
4. Review Cursor's validation report
5. Fix any issues found
6. Re-run validation until 100% accurate
