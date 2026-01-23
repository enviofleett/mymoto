# Offline Status Implementation Summary

## Overview
Implemented comprehensive offline status indication across all points in the PWA to ensure users can clearly see when vehicles are offline.

## Components Updated

### 1. ✅ ProfileHeader (`src/pages/owner/OwnerVehicleProfile/components/ProfileHeader.tsx`)
- **Added**: Offline badge with duration below vehicle name
- **Shows**: "Offline for X hours/minutes" when vehicle is offline
- **Visual**: Badge with WifiOff icon

### 2. ✅ CurrentStatusCard (`src/pages/owner/OwnerVehicleProfile/components/CurrentStatusCard.tsx`)
- **Added**: Offline duration display
- **Shows**: "Offline for X" with WifiOff icon
- **Visual**: Red/destructive text for offline status
- **Enhanced**: More prominent offline indication

### 3. ✅ StatusMetricsRow (`src/pages/owner/OwnerVehicleProfile/components/StatusMetricsRow.tsx`)
- **Added**: Offline badges on Battery and Mileage cards
- **Shows**: "N/A" for data when offline
- **Visual**: Cards show reduced opacity and "Data unavailable" message
- **Indicators**: WifiOff icon badges

### 4. ✅ EngineControlCard (`src/pages/owner/OwnerVehicleProfile/components/EngineControlCard.tsx`)
- **Added**: Alert message when vehicle is offline
- **Shows**: "Vehicle is offline. Engine controls are unavailable until the vehicle reconnects."
- **Visual**: Alert banner with WifiOff icon
- **Behavior**: Buttons disabled with tooltip explaining why

### 5. ✅ VehicleLocationMap (`src/components/fleet/VehicleLocationMap.tsx`)
- **Added**: Offline badge in address card
- **Shows**: "Location unavailable (offline)" in italic text
- **Visual**: Badge with WifiOff icon
- **Marker**: Already shows offline styling (gray marker)

### 6. ✅ VehiclePopupContent (`src/components/fleet/VehiclePopupContent.tsx`)
- **Added**: Offline badge and duration in map popups
- **Shows**: "Offline" badge and "Offline for X" message
- **Visual**: Badge with WifiOff icon, speed shows "N/A"

### 7. ✅ VehicleCard (`src/components/profile/VehicleCard.tsx`)
- **Enhanced**: Offline status with duration
- **Shows**: "Offline for X" in red text
- **Visual**: WifiOff icon, prominent offline badge

### 8. ✅ VehicleTable (`src/components/fleet/VehicleTable.tsx`)
- **Enhanced**: Offline badge with duration
- **Shows**: "Offline" badge with WifiOff icon + duration in red
- **Visual**: More prominent offline indication

### 9. ✅ OwnerVehicles Page (`src/pages/owner/OwnerVehicles.tsx`)
- **Enhanced**: Offline badge in vehicle cards
- **Shows**: WifiOff icon in status badge
- **Visual**: Muted background for offline status

## Utility Functions Created

### `src/utils/timezone.ts`
- **Added**: `getOfflineDuration()` function
- **Purpose**: Calculates and formats offline duration (e.g., "2 hours", "5 minutes", "3 days")

### `src/utils/vehicleStatus.ts` (Created)
- **Purpose**: Centralized vehicle status utilities
- **Functions**:
  - `getVehicleStatus()` - Determines status from data
  - `getVehicleStatusInfo()` - Gets display info for status
  - `getOfflineDuration()` - Formats offline duration
  - `isVehicleOffline()` - Checks if vehicle should be considered offline

## Visual Indicators

### Icons
- **WifiOff** icon used consistently across all components
- **Color**: Muted/destructive colors for offline status

### Badges
- **Variant**: `outline` for offline badges
- **Style**: `bg-muted/50 text-muted-foreground border-muted`
- **Icon**: WifiOff icon included

### Colors
- **Offline text**: `text-muted-foreground` or `text-destructive/80`
- **Offline backgrounds**: `bg-muted` or `bg-muted/50`
- **Reduced opacity**: `opacity-60` for disabled states

## Status Logic

### Offline Detection
- **Primary**: `is_online === false` from `vehicle_positions` table
- **Secondary**: No valid GPS coordinates
- **Tertiary**: Stale GPS data (>10 minutes old, configurable)

### Status Hierarchy
1. **Offline** - `is_online === false` or no GPS
2. **Charging** - Online, ignition off, speed 0, has battery data
3. **Moving** - Online, speed > 0
4. **Stopped** - Online, speed === 0

## All Display Points

### Vehicle Profile Page
- ✅ ProfileHeader - Badge with duration
- ✅ CurrentStatusCard - Status with duration
- ✅ StatusMetricsRow - Badges on cards
- ✅ EngineControlCard - Alert message
- ✅ VehicleMapSection - Address card shows offline
- ✅ Map marker - Gray styling for offline

### Vehicle Lists
- ✅ OwnerVehicles page - Status badge with icon
- ✅ VehicleTable - Badge with duration
- ✅ VehicleCard (Profile) - Badge with duration
- ✅ VehiclePopupContent (Map) - Badge and message

### Fleet Views
- ✅ Fleet page - Status badges
- ✅ LiveMap - Status indicators
- ✅ VehicleTable - Offline filter and badges

## Consistency

All components now:
- ✅ Show WifiOff icon for offline status
- ✅ Display offline duration when available
- ✅ Use consistent badge styling
- ✅ Show "N/A" or "unavailable" for data when offline
- ✅ Disable controls when offline (with explanation)
- ✅ Use muted/destructive colors for offline

## Testing Checklist

- [ ] Vehicle profile shows offline badge when `is_online = false`
- [ ] Offline duration appears correctly
- [ ] Map marker shows gray/offline styling
- [ ] Engine controls show alert when offline
- [ ] Battery/Mileage show "N/A" when offline
- [ ] Vehicle lists show offline badges
- [ ] Map popups show offline status
- [ ] All components use consistent styling

## Next Steps

1. Test with a vehicle that is actually offline
2. Verify offline duration calculation
3. Check all display points show offline status
4. Ensure realtime updates reflect offline status changes
