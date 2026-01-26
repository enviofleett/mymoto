# Sync Official Reports Edge Function - Implementation Complete

## Overview

The `sync-official-reports` Edge Function has been created to synchronize official GPS51 trip and mileage data to local database tables, ensuring 100% parity with the GPS51 platform.

## Function Location

**File:** `supabase/functions/sync-official-reports/index.ts`

## Features Implemented

### 1. Trip Sync (querytrips API)
- Fetches official trips from GPS51 `querytrips` API
- Maps GPS51 trip format to `vehicle_trips` table schema
- Handles both timestamp (ms) and string time formats
- Normalizes speeds from m/h to km/h using `normalizeSpeed()`
- Converts distance from meters to kilometers
- Upserts with conflict resolution on `(device_id, start_time, end_time)`
- Handles missing coordinates gracefully (uses 0 as placeholder)

### 2. Daily Mileage Sync (reportmileagedetail API)
- Fetches official daily mileage from GPS51 `reportmileagedetail` API
- Maps GPS51 mileage format to `vehicle_mileage_details` table schema
- Processes all records returned (handles multiple time periods per day)
- Preserves GPS51 units (meters for distance, 1/100L for fuel)
- Converts speed from m/h to km/h for display
- Upserts with conflict resolution on `(device_id, statisticsday, gps51_record_id)`
- Generates unique `gps51_record_id` if missing from API response

### 3. Error Handling
- Gracefully handles empty API responses (no trips/mileage = success, not error)
- Continues processing even if one sync fails (trips and mileage sync independently)
- Logs all errors without blocking execution
- Returns detailed error information in response

### 4. Input Validation
- Validates `device_id` and `date` parameters are present
- Validates date format (YYYY-MM-DD)
- Validates date value is parseable
- Returns clear error messages for invalid input

### 5. Logging
- Logs sync start/completion with device and date
- Logs number of trips/mileage records fetched vs. upserted
- Logs batch processing progress
- Logs errors with context

## API Usage

### Request Format
```json
{
  "device_id": "358657105966092",
  "date": "2026-01-26",
  "timezone": 8  // Optional, defaults to 8 (GMT+8)
}
```

### Response Format
```json
{
  "success": true,
  "device_id": "358657105966092",
  "date": "2026-01-26",
  "trips": {
    "fetched": 5,
    "upserted": 5,
    "errors": []  // Only present if errors occurred
  },
  "mileage": {
    "fetched": 1,
    "upserted": 1,
    "errors": []  // Only present if errors occurred
  },
  "duration_ms": 1234
}
```

## Database Tables

### vehicle_trips
- **Conflict Key:** `(device_id, start_time, end_time)`
- **Unique Index:** `idx_vehicle_trips_unique_timing`
- **Fields Synced:**
  - `device_id`, `start_time`, `end_time`
  - `start_latitude`, `start_longitude`, `end_latitude`, `end_longitude`
  - `distance_km`, `max_speed`, `avg_speed`, `duration_seconds`

### vehicle_mileage_details
- **Conflict Key:** `(device_id, statisticsday, gps51_record_id)`
- **Unique Constraint:** `unique_device_date`
- **Fields Synced:**
  - `device_id`, `statisticsday`, `gps51_record_id`
  - `totaldistance` (meters), `runoilper100km`, `begindis`, `enddis`
  - `beginoil`, `endoil`, `ddoil`, `idleoil`, `leakoil`
  - `avgspeed` (km/h), `overspeed`, `oilper100km`, `oilperhour`
  - `totalacc`, `starttime`, `endtime`

## Configuration

**File:** `supabase/config.toml`

```toml
[functions.sync-official-reports]
verify_jwt = false
```

## Dependencies

- `_shared/gps51-client.ts`: For API calls with rate limiting
- `_shared/telemetry-normalizer.ts`: For speed normalization
- Supabase client: For database operations

## Environment Variables Required

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access
- `DO_PROXY_URL`: DigitalOcean proxy URL for GPS51 API calls

## Testing

### Test Cases

1. **Valid device with trips:**
   ```json
   {
     "device_id": "358657105966092",
     "date": "2026-01-26"
   }
   ```
   Expected: Returns trips and mileage data

2. **Device with no trips:**
   ```json
   {
     "device_id": "358657105966092",
     "date": "2025-01-01"
   }
   ```
   Expected: Returns success with `trips.fetched = 0`

3. **Invalid date format:**
   ```json
   {
     "device_id": "358657105966092",
     "date": "26-01-2026"
   }
   ```
   Expected: Returns 400 error

4. **Missing parameters:**
   ```json
   {
     "device_id": "358657105966092"
   }
   ```
   Expected: Returns 400 error

### Verification Queries

After running the sync, verify data:

```sql
-- Check trips synced
SELECT COUNT(*) as trip_count, SUM(distance_km) as total_distance
FROM vehicle_trips
WHERE device_id = '358657105966092'
  AND DATE(start_time) = '2026-01-26';

-- Check mileage synced
SELECT statisticsday, totaldistance, runoilper100km
FROM vehicle_mileage_details
WHERE device_id = '358657105966092'
  AND statisticsday = '2026-01-26';
```

## Deployment

1. **Deploy the function:**
   ```bash
   supabase functions deploy sync-official-reports
   ```

2. **Verify deployment:**
   - Check function appears in Supabase Dashboard
   - Test with a sample request

3. **Test the function:**
   ```bash
   curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-official-reports' \
     -H 'Authorization: Bearer YOUR_ANON_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"device_id": "358657105966092", "date": "2026-01-26"}'
   ```

## Integration with Frontend

The frontend can call this function to sync official GPS51 data:

```typescript
const response = await supabase.functions.invoke('sync-official-reports', {
  body: {
    device_id: deviceId,
    date: '2026-01-26', // YYYY-MM-DD format
  },
});
```

## Benefits

- ✅ **100% Data Parity**: Uses GPS51's official trip and mileage calculations
- ✅ **Overwrites Local Data**: Replaces locally-calculated trips with GPS51 authoritative data
- ✅ **Idempotent**: Can be run multiple times safely (upsert prevents duplicates)
- ✅ **Error Resilient**: Continues processing even if one part fails
- ✅ **Efficient**: Batch processing for large datasets

## Next Steps

1. Deploy the function to production
2. Test with real device data
3. Verify data matches GPS51 platform exactly
4. Integrate into frontend for on-demand sync
5. Consider scheduling periodic syncs via CRON
