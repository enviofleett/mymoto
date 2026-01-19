# "Charging" Status Explanation

## Current Implementation

### Location
**File:** `src/pages/owner/OwnerVehicleProfile/index.tsx` (lines 157-170)

### Logic
The "charging" status is determined by the following conditions:

```typescript
const isCharging = 
  liveData.batteryPercent !== null &&  // Battery data is available
  liveData.ignitionOn === false &&      // Ignition is OFF
  liveData.speed === 0;                 // Vehicle is stationary (not moving)
```

### Status Priority
1. **Offline** - Vehicle is not online (`isOnline === false`)
2. **Charging** - Vehicle is online AND (battery present AND ignition OFF AND speed = 0)
3. **Online** - Vehicle is online but not in charging state

## What "Charging" Means

### Current Interpretation
The system shows "Charging" when:
- ✅ Vehicle is **online** (GPS tracker is connected)
- ✅ **Battery percentage** is available (not null)
- ✅ **Ignition is OFF** (vehicle is not running)
- ✅ **Speed is 0** (vehicle is stationary)

### Visual Display
- **Icon:** ⚡ (lightning bolt)
- **Label:** "Charging"
- **Description:** "Charging in progress"
- **Color:** Yellow/orange background (`bg-yellow-500/20`)

## Important Notes

### ⚠️ Limitations
1. **Heuristic-Based Detection:**
   - This is an **inferred** status, not a direct charging signal
   - The system doesn't receive actual charging state from the GPS device
   - It assumes: "online + battery + ignition off + stationary = charging"

2. **May Not Be Accurate For:**
   - **Non-electric vehicles:** Regular cars don't "charge" - this might be misleading
   - **Vehicles parked with ignition off:** Will show as "charging" even if just parked
   - **Vehicles with dead battery:** If battery is 0% but vehicle is online, might show as charging

3. **Edge Cases:**
   - Vehicle parked with ignition off → Shows "charging" (might be incorrect)
   - Vehicle with no battery data → Shows "online" (can't detect charging)
   - Vehicle moving slowly → Shows "online" (speed > 0)

## Use Cases

### When "Charging" Status Appears:
1. **Electric Vehicle Charging:**
   - EV plugged in and charging
   - Battery percentage increasing
   - Ignition off, not moving

2. **Vehicle Parked:**
   - Vehicle parked with ignition off
   - Battery present (for vehicles with battery monitoring)
   - Not moving

3. **Vehicle Maintenance:**
   - Vehicle in garage/service
   - Connected to power source
   - Ignition off, stationary

## Recommendations

### For Better Accuracy:

1. **Add Actual Charging Signal (if available):**
   ```typescript
   // If GPS device provides charging state
   const isCharging = liveData.isCharging || (
     liveData.batteryPercent !== null && 
     liveData.ignitionOn === false && 
     liveData.speed === 0
   );
   ```

2. **Check Battery Trend:**
   ```typescript
   // Only show charging if battery is increasing
   const isCharging = batteryPercent !== null && 
                      batteryPercent > previousBatteryPercent &&
                      ignitionOn === false && 
                      speed === 0;
   ```

3. **Vehicle Type Consideration:**
   ```typescript
   // Only show charging for electric vehicles
   const isCharging = vehicleType === 'electric' && 
                      batteryPercent !== null && 
                      ignitionOn === false && 
                      speed === 0;
   ```

4. **Better Labeling:**
   - Consider "Parked" or "Idle" for non-EV vehicles
   - Or "Charging/Parked" to be more accurate

## Current User Experience

### What Users See:
- **Status Card:** Shows "Charging" with ⚡ icon
- **Header:** Yellow/orange status indicator dot
- **Description:** "Charging in progress"

### What It Actually Means:
- Vehicle is online and stationary
- Ignition is off
- Battery data is available
- **May or may not actually be charging** (especially for non-EV vehicles)

## Summary

**"Charging" status is a heuristic that indicates:**
- Vehicle is online, stationary, with ignition off, and has battery data
- It's an **inferred** state, not a direct charging signal
- For electric vehicles, it likely means charging
- For regular vehicles, it likely means parked/idle
- The label might be misleading for non-electric vehicles

**Recommendation:** Consider renaming to "Parked/Charging" or adding vehicle type detection to show appropriate status.
