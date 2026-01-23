# GPS51 32-bit Status Ignition Detection - Test Examples

## Overview
The updated `telemetry-normalizer.ts` now correctly handles 32-bit GPS51 status values with confidence-based ignition detection.

## How It Works

### Status Field Structure (32-bit)
```
Status = 262151 (0x00040007)
         ^^^^^^^^
         32-bit integer

Base Status    = Lower 16 bits = status & 0xFFFF    = 0x0007 = 7
Extended Status = Upper 16 bits = status >>> 16      = 0x0004 = 4
```

### Confidence Scoring
- **Base JT808 ACC bit (bit 0)**: +0.6 confidence
- **Extended GPS51 ACC bit (bit 16)**: +0.2 confidence  
- **Speed > 3 km/h**: +0.2 confidence
- **Threshold**: ignition_on = confidence >= 0.5

## Test Cases

### Case 1: Base ACC ON, no speed
```typescript
// Status = 262151 (0x40007)
// Base = 7 (0x0007, binary: 0000 0000 0000 0111) → bit 0 = 1 (ACC ON)
// Extended = 4 (0x0004, binary: 0000 0000 0000 0100) → bit 0 = 0 (ACC OFF)
// Speed = 0 km/h

Confidence = 0.6 (base ACC)
Result: ignition_on = true ✓ (confidence >= 0.5)
```

### Case 2: Base ACC ON + speed
```typescript
// Status = 262151 (0x40007)  
// Base = 7 → bit 0 = 1 (ACC ON)
// Extended = 4 → bit 0 = 0 (ACC OFF)
// Speed = 5 km/h

Confidence = 0.6 (base) + 0.2 (speed) = 0.8
Result: ignition_on = true ✓ (high confidence)
```

### Case 3: Base + Extended ACC ON + speed
```typescript
// Status = 65537 (0x10001)
// Base = 1 (0x0001, binary: 0000 0000 0000 0001) → bit 0 = 1 (ACC ON)
// Extended = 1 (0x0001, binary: 0000 0000 0000 0001) → bit 0 = 1 (ACC ON)
// Speed = 10 km/h

Confidence = 0.6 (base) + 0.2 (extended) + 0.2 (speed) = 1.0
Result: ignition_on = true ✓ (max confidence)
```

### Case 4: Base ACC OFF, Extended ACC ON (low confidence)
```typescript
// Status = 65536 (0x10000)
// Base = 0 (0x0000) → bit 0 = 0 (ACC OFF)
// Extended = 1 (0x0001) → bit 0 = 1 (ACC ON)
// Speed = 0 km/h

Confidence = 0.2 (extended only)
Result: ignition_on = false ✗ (confidence < 0.5)
⚠️  Logs warning: "Low confidence ACC detection (0.20): signals=[ext_acc=ON]"
```

### Case 5: Only speed, no ACC bits
```typescript
// Status = 262150 (0x40006)
// Base = 6 (0x0006, binary: 0000 0000 0000 0110) → bit 0 = 0 (ACC OFF)
// Extended = 4 (0x0004, binary: 0000 0000 0000 0100) → bit 0 = 0 (ACC OFF)
// Speed = 5 km/h

Confidence = 0.2 (speed only)
Result: ignition_on = false ✗ (confidence < 0.5)
⚠️  Logs warning: "Low confidence ACC detection (0.20): signals=[speed=5km/h]"
```

### Case 6: Extended ACC + speed (borderline)
```typescript
// Status = 65536 (0x10000)
// Base = 0 → bit 0 = 0
// Extended = 1 → bit 0 = 1
// Speed = 5 km/h

Confidence = 0.2 (extended) + 0.2 (speed) = 0.4
Result: ignition_on = false ✗ (confidence < 0.5)
⚠️  Logs warning: "Low confidence ACC detection (0.40): signals=[ext_acc=ON, speed=5km/h]"
```

### Case 7: Old 16-bit status still works
```typescript
// Status = 1 (standard JT808, no extended bits)
// Base = 1 (0x0001) → bit 0 = 1 (ACC ON)
// Extended = 0 (no upper bits)
// Speed = 0 km/h

Confidence = 0.6 (base ACC)
Result: ignition_on = true ✓ (backward compatible)
```

## Key Improvements

### ✅ Fixed Issues
1. **No more false warnings** for status > 65535 (e.g., 262150, 262151)
2. **32-bit support**: Correctly extracts base (lower 16) and extended (upper 16) bits
3. **Confidence-based**: Combines multiple signals for reliable detection
4. **Targeted logging**: Only warns when confidence < 0.5 AND signals conflict

### ✅ Backward Compatible
- Old 16-bit status values (0-65535) still work correctly
- API shape unchanged (`detectIgnition` returns `IgnitionDetectionResult`)
- No breaking changes to consumers

## Bit Masking Reference

```typescript
// Extract base JT808 status (lower 16 bits)
const baseStatus = status & 0xFFFF;

// Extract extended GPS51 status (upper 16 bits)  
const extendedStatus = status >>> 16;

// Check ACC bit (bit 0)
const baseAcc = (baseStatus & 0x01) === 0x01;
const extendedAcc = (extendedStatus & 0x01) === 0x01;
```

## Example Status Values from GPS51 Devices

| Status Value | Hex       | Base (hex) | Ext (hex) | Base bit 0 | Ext bit 0 | Confidence (no speed) |
|-------------|-----------|------------|-----------|------------|-----------|---------------------|
| 1           | 0x000001  | 0x0001     | 0x0000    | ON ✓       | OFF       | 0.6 → **ON**       |
| 6           | 0x000006  | 0x0006     | 0x0000    | OFF        | OFF       | 0.0 → **OFF**      |
| 7           | 0x000007  | 0x0007     | 0x0000    | ON ✓       | OFF       | 0.6 → **ON**       |
| 65536       | 0x010000  | 0x0000     | 0x0001    | OFF        | ON ✓      | 0.2 → **OFF**      |
| 65537       | 0x010001  | 0x0001     | 0x0001    | ON ✓       | ON ✓      | 0.8 → **ON**       |
| 262150      | 0x040006  | 0x0006     | 0x0004    | OFF        | OFF       | 0.0 → **OFF**      |
| 262151      | 0x040007  | 0x0007     | 0x0004    | ON ✓       | OFF       | 0.6 → **ON**       |

## Debug Logging

Set environment variable to enable detailed logging:
```bash
export LOG_IGNITION_DETECTION=true
```

Example log output:
```
[checkJt808AccBit] ACC ON detected: confidence=0.80, status=262151 (base=0x7, ext=0x4), base_acc=true, ext_acc=false, speed=5km/h
```

## Testing Your Device

To verify your GPS51 device status values:

1. Check current status field value in raw telemetry
2. Calculate base and extended:
   ```javascript
   const status = 262151; // Your actual value
   const base = status & 0xFFFF;
   const extended = status >>> 16;
   console.log(`Base: ${base} (0x${base.toString(16)})`);
   console.log(`Extended: ${extended} (0x${extended.toString(16)})`);
   console.log(`Base bit 0: ${(base & 0x01) === 1 ? 'ON' : 'OFF'}`);
   console.log(`Extended bit 0: ${(extended & 0x01) === 1 ? 'ON' : 'OFF'}`);
   ```
3. Verify ignition detection matches vehicle state
