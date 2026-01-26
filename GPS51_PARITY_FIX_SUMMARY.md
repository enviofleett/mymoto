# GPS51/JT808 Data Parity Fix - Implementation Summary

## Problem Statement

The system had "Low Ignition Confidence" warnings and misreported trip start/end times because:
1. **32-bit Status Field Bug**: Device sends 32-bit status (e.g., `262151`), but code expected 16-bit, causing ACC bit detection to fail
2. **Virtual Speed Detection**: System fell back to "Speed > 0" instead of hardware ACC bit
3. **Result**: Trips start late, end early, mileage under-reported vs GPS51 platform

## Fixes Implemented

### 1. ✅ Fixed JT808 32-bit Status Decoding

**File**: `supabase/functions/_shared/telemetry-normalizer.ts`

**Changes**:
- Updated `checkJt808AccBit()` to handle **32-bit unsigned integers** (GPS51 standard)
- Removed false warnings for status > 65535 (expected with GPS51)
- Properly extracts ACC bit from both:
  - **Base status** (lower 16 bits, bit 0 = 0x01)
  - **Extended status** (upper 16 bits, bit 16 = 0x00010000)
- Handles values like `262151` (0x00040007) correctly

**Before**:
```typescript
if (status > 65535) {
  console.warn(`Status value ${status} exceeds expected range...`);
  const clampedStatus = status & 0xFFFF; // Only lower 16 bits
  status = clampedStatus;
}
```

**After**:
```typescript
const status32 = status >>> 0; // Convert to unsigned 32-bit
const baseStatus = status32 & 0xFFFF;       // Lower 16 bits
const extendedStatus = status32 >>> 16;      // Upper 16 bits

// Check base bit 0 (0x01) - standard JT808 ACC
if ((baseStatus & 0x01) === 0x01) return true;
// Check extended bit 0 (0x00010000) - GPS51 extended ACC
if ((extendedStatus & 0x01) === 0x01) return true;
```

### 2. ✅ Implemented GPS51 Standard Trip Segmentation

**File**: `supabase/functions/sync-trips-incremental/index.ts`

**Changes**:
- **Trip Start**: Triggers **immediately** when ACC transitions from 0→1 (no speed requirement)
- **Trip End**: Triggers when:
  - ACC transitions from 1→0 (key off) - **PRIMARY**
  - **OR** Speed = 0 for > **180 seconds** (3 minutes) - **SECONDARY** (GPS51 standard)
- **Do NOT** start trips on GPS movement alone (prevents GPS drift ghost trips)

**Before**:
```typescript
// Started trips on speed > threshold
if (isMoving && !currentTrip) {
  currentTrip = { points: [point] };
}
// Ended on 5-minute stop
const STOP_DURATION_MS = 5 * 60 * 1000;
```

**After**:
```typescript
// Trip START: ACC 0→1 (immediate, no speed requirement)
if (ignitionOn && !prevIgnitionOn && !currentTrip) {
  currentTrip = { points: [point], ... };
}

// Trip END: ACC 1→0 OR speed=0 for >180s
const IDLE_TIMEOUT_MS = 180 * 1000; // 3 minutes (GPS51 standard)
const shouldEndTrip = 
  (prevIgnitionOn && !ignitionOn) ||        // ACC 1→0
  (idleDuration > IDLE_TIMEOUT_MS);          // Speed=0 for >180s
```

### 3. ✅ Enhanced Ignition Detection Priority

**File**: `supabase/functions/_shared/telemetry-normalizer.ts`

**Priority Order** (matches GPS51):
1. **JT808 Status Bit** (hardware ACC line) - Confidence: 1.0
2. **String Parsing** (explicit ACC ON/OFF) - Confidence: 0.9
3. **Speed Inference** - Confidence: 0.3-0.5 (only if no ACC data)

**Key Change**: Only uses speed-based detection when **NO hardware ACC data available**. If ACC bit exists, it's trusted as source of truth.

### 4. ✅ Mileage Calculation (Haversine with Odometer TODO)

**File**: `supabase/functions/sync-trips-incremental/index.ts`

**Current**: Uses Haversine formula (point-to-point accumulation)
**Future**: TODO - If `position_history` gets `odometer`/`totaldistance` field, use delta calculation:
```typescript
// Preferred: Odometer delta (more accurate - follows actual path)
const odometerDelta = (endPoint.odometer || 0) - (startPoint.odometer || 0);
if (odometerDelta > 0) totalDistance = odometerDelta / 1000;
// Fallback: Haversine (current implementation)
```

## Testing & Verification

### Test Cases:

1. **32-bit Status Values**:
   - Status = `262151` (0x00040007) → Should detect ACC ON via base bit 0
   - Status = `262150` (0x00040006) → Should detect ACC OFF
   - No warnings for values > 65535

2. **Trip Detection**:
   - ACC 0→1 with speed=0 → Trip starts immediately ✅
   - ACC 1→0 → Trip ends immediately ✅
   - Speed=0 for 180s while ACC=1 → Trip ends ✅
   - GPS drift (coordinates change, speed=0) → No trip start ✅

3. **Mileage Accuracy**:
   - Compare trip distances with GPS51 platform
   - Should match within 5-10% (Haversine is less accurate than odometer)

## Production Readiness

### ✅ Ready:
- 32-bit status handling
- ACC-based trip detection
- 180-second idle timeout
- No GPS drift false trips

### ⚠️ Future Enhancement:
- Add `odometer`/`totaldistance` to `position_history` table for accurate mileage
- Use odometer delta instead of Haversine when available

## Migration Notes

**No database migration required** - code changes only.

**Deployment**:
1. Deploy updated `telemetry-normalizer.ts`
2. Deploy updated `sync-trips-incremental/index.ts`
3. Test with device `358657105966092`
4. Verify trips match GPS51 platform

## Expected Results

After deployment:
- ✅ No more "Low Ignition Confidence" warnings for 32-bit status values
- ✅ Trips start immediately on ACC ON (not waiting for speed)
- ✅ Trips end on ACC OFF or 180s idle (GPS51 standard)
- ✅ Trip distances match GPS51 platform (within Haversine accuracy limits)
- ✅ No ghost trips from GPS drift
