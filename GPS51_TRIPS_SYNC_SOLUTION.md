# Solution: Use GPS51 querytrips API Directly

## Problem Summary
- We're detecting 5 trips but they don't match GPS51's 5 trips
- All ignition_on values in position_history are false (can't use ACC-based detection)
- Our speed-based detection doesn't match GPS51's ACC on/off detection

## Root Cause
GPS51 uses ACC (ignition) status to determine trips (section 6.1: "Trip report is collected as per travel based on from ACC on to off status"). Our position_history doesn't have accurate ACC status, so we can't replicate GPS51's detection.

## Solution
**Use GPS51's `querytrips` API directly** to get the exact trips GPS51 shows.

## GPS51 querytrips API (Section 6.1)

### Request
- **Action:** `querytrips`
- **Parameters:**
  - `deviceid`: Device ID (string)
  - `begintime`: Start time (yyyy-MM-dd HH:mm:ss)
  - `endtime`: End time (yyyy-MM-dd HH:mm:ss)
  - `timezone`: Time zone (default GMT+8)

### Response
```json
{
  "deviceid": "358657105967694",
  "totalmaxspeed": 57.0,
  "totaldistance": 20100,
  "totalaveragespeed": 12.0,
  "totaltriptime": 4740000,
  "totaltrips": [
    {
      // Trip data here
    }
  ]
}
```

## Implementation Plan

1. **Add GPS51 API helper functions** to sync-trips-incremental:
   - `getValidToken()` - Get GPS51 token and serverid
   - `callGps51()` - Call GPS51 API via proxy
   - `formatDateForGps51()` - Format dates for GPS51 API

2. **Add querytrips function:**
   - Call GPS51 querytrips API for date range
   - Parse GPS51 trip response
   - Map to our vehicle_trips format

3. **Update sync logic:**
   - For each device, call GPS51 querytrips for today (or date range)
   - Get trips from GPS51
   - Check for duplicates
   - Insert new trips

4. **Benefits:**
   - ✅ 100% match with GPS51 platform
   - ✅ Uses GPS51's ACC-based detection
   - ✅ No need to parse position_history
   - ✅ More reliable and accurate

## Next Steps
1. Update `sync-trips-incremental/index.ts` to use GPS51 querytrips API
2. Test with device 358657105967694
3. Verify trips match GPS51 exactly
