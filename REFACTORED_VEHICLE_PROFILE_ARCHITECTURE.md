# Refactored Vehicle Profile Architecture

## Overview
The Vehicle Profile page has been significantly refactored to streamline data fetching, remove unused reporting components, and ensure 100% data accuracy by fetching directly from the GPS 51 platform.

## Removed Components
The following components and their associated logic have been completely removed from the Vehicle Profile page:
- **ReportsSection**: Removed tabs for Trips, Alarms, and Geofences.
- **MileageSection**: Removed mileage reporting, driving stats, and mileage trends charts.
- **TripPlaybackDialog**: Removed trip playback functionality.
- **Hooks**: Removed `useVehicleTrips`, `useVehicleEvents`, `useMileageStats`, `useDailyMileage`, `useVehicleDailyStats`, `useTripSyncStatus`.

## New Data Architecture
### Direct GPS 51 Fetching
- **Mechanism**: The page now uses a "Direct Mode" data fetching strategy.
- **Hook**: A new `fetchVehicleLiveDataDirect` function in `useVehicleLiveData.ts` invokes the `gps-data` Edge Function with `use_cache: false`.
- **Edge Function**: The `gps-data` function calls the GPS 51 API directly and returns the fresh data in the response.
- **Latency**: This bypasses the database write-then-read latency, providing the most up-to-date status possible (100% accuracy relative to GPS 51).
- **Polling**: The client polls this direct endpoint every 15 seconds.

### Data Flow
1. **Client**: `OwnerVehicleProfile` mounts -> calls `fetchVehicleLiveDataDirect`.
2. **Edge**: `gps-data` function -> GPS 51 API (via proxy).
3. **Response**: GPS 51 API -> `gps-data` (normalizes data) -> Client.
4. **Display**: Client updates React state immediately with the normalized data.

## Timezone Handling
- **Standard**: All timestamps are handled using the `Africa/Lagos` (GMT+1) timezone.
- **Implementation**:
  - The `gps-data` function returns UTC timestamps from GPS 51.
  - The frontend converts these to Lagos time using `formatLagos` from `@/lib/timezone.ts` in the `ProfileHeader`.
  - This ensures consistent time display across the application.

## Benefits
- **Simplified UI**: Clutter-free interface focused purely on real-time status and control.
- **Performance**: Reduced client-side processing and state management.
- **Accuracy**: Elimination of database sync lag for the user-facing status.
- **Maintenance**: Fewer dependencies and complex hooks to maintain.
