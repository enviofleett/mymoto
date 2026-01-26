# Fix: vehicle_mileage_details Table Not Found

## Issue
Console error: `GET .../vehicle_mileage_details?select=*&device_id=eq.358657105966092 404 (Not Found)`

## Root Cause
The code was trying to query `vehicle_mileage_details` table which doesn't exist in the GPS51 implementation. This table was likely from an older implementation that included fuel consumption data.

## Solution
Updated `fetchVehicleMileageDetails` function to:
1. Return empty array gracefully (no 404 errors)
2. Log a dev-only message explaining that fuel consumption data is not available from GPS51
3. The component (`MileageSection`) already handles this case with `hasMileageData` check

## GPS51 Data Model
- **Available:** `vehicle_daily_stats` view (trip count, distance, speed, duration)
- **Not Available:** Fuel consumption data (`oilper100km`, `leakoil`, etc.)

## Component Behavior
The `MileageSection` component:
- Uses `useVehicleDailyStats` for trip/mileage data (GPS51 source) ✅
- Uses `useVehicleMileageDetails` for fuel consumption (not available, returns empty) ⚠️
- Gracefully handles missing fuel data with `hasMileageData` check ✅

## Result
- No more 404 errors in console
- Component continues to work with available GPS51 data
- Fuel consumption features are disabled (as expected with GPS51 data source)
