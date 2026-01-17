# Vehicle Telemetry Normalizer - Implementation Complete

## Summary

Successfully implemented a centralized Vehicle Telemetry Normalizer that converts raw GPS51 fields into consistent, reliable vehicle states. All GPS51 data now passes through this normalization layer before storage or exposure to frontend.

---

## What Was Implemented

### 1. Centralized Normalizer Service ✅

**File:** `supabase/functions/_shared/telemetry-normalizer.ts`

**Features:**
- Smart speed detection and normalization (m/h → km/h with unit detection)
- Multi-signal ignition detection with confidence scoring
- Configurable battery voltage mapping (12V/24V/48V support)
- Signal strength normalization (rxlevel to percentage)
- Coordinate validation (rejects null island, out-of-range)
- Data quality scoring (high/medium/low)
- Complete output contract with all telemetry fields

**Key Functions:**
- `normalizeVehicleTelemetry()` - Main entry point
- `normalizeSpeed()` - Smart speed conversion
- `detectIgnition()` - Multi-signal confidence scoring
- `normalizeBatteryLevel()` - Priority-based battery mapping
- `normalizeSignalStrength()` - rxlevel to percentage
- `normalizeCoordinates()` - Coordinate extraction and validation
- `calculateDataQuality()` - Quality scoring

---

### 2. Updated Functions ✅

#### `gps-data/index.ts`
- ✅ Replaced manual `parseIgnition()` with normalizer
- ✅ Replaced manual speed/battery parsing with `normalizeVehicleTelemetry()`
- ✅ Speed now stored in km/h (normalized)
- ✅ Battery uses priority-based mapping
- ✅ Ignition uses confidence scoring

#### `gps-history-backfill/index.ts`
- ✅ Replaced manual parsing with `normalizeVehicleTelemetry()`
- ✅ Speed normalized to km/h before storage
- ✅ Coordinates validated before insertion
- ✅ Battery level uses voltage mapping when percent missing

#### `sync-trips-incremental/index.ts`
- ✅ Replaced inline speed normalization with `normalizeSpeed()`
- ✅ GPS51 trip speeds normalized using normalizer
- ✅ Position history speeds normalized during trip extraction

---

## Key Improvements

### Speed Normalization
**Before:**
```typescript
speed: record.speed || 0  // Raw value, unit unknown
```

**After:**
```typescript
speed: normalized.speed_kmh  // Always in km/h, < 3 km/h = 0
```

### Ignition Detection
**Before:**
```typescript
ignition_on: strstatus.toUpperCase().includes('ACC ON')  // Single signal
```

**After:**
```typescript
ignition_on: detectIgnition(raw, speedKmh)  // Multi-signal confidence scoring
```

### Battery Level
**Before:**
```typescript
battery_percent: record.voltagepercent > 0 ? record.voltagepercent : null
```

**After:**
```typescript
battery_level: normalizeBatteryLevel(raw, config)  // Priority: percent > voltage > null
```

---

## Data Quality Rules Enforced

1. ✅ **Never expose raw GPS51 fields** - All data normalized before storage
2. ✅ **Always normalize before storage** - Single source of truth
3. ✅ **Clamp invalid values** - Speed max 300 km/h, battery 0-100%
4. ✅ **Default unknown states safely** - null for missing data
5. ✅ **Coordinate validation** - Rejects 0,0 and out-of-range

---

## Output Contract

All normalized data follows this contract:

```typescript
interface NormalizedVehicleState {
  vehicle_id: string;
  lat: number | null;
  lon: number | null;
  speed_kmh: number;              // Always in km/h, < 3 = 0
  ignition_on: boolean;          // Confidence-scored
  is_moving: boolean;              // speed > 3 km/h or moving flag
  battery_level: number | null;   // 0-100% or null
  signal_strength: number | null; // 0-100% or null
  heading: number | null;
  altitude: number | null;
  is_online: boolean;
  last_updated_at: string;       // ISO8601
  timestamp_source: 'gps' | 'server';
  data_quality: 'high' | 'medium' | 'low';
}
```

---

## Testing Recommendations

### Unit Tests Needed

1. **Speed = 0 but ACC ON**
   - Input: `speed: 0, strstatus: "ACC ON"`
   - Expected: `ignition_on: true` (confidence from strstatus)

2. **Vehicle moving without voltage**
   - Input: `speed: 5000 (m/h), voltagev: null, voltagepercent: null`
   - Expected: `speed_kmh: 5, battery_level: null, ignition_on: true` (confidence from speed)

3. **Voltage present but percent missing**
   - Input: `voltagev: 12.4, voltagepercent: 0`
   - Expected: `battery_level: 75` (mapped from voltage)

4. **Speed unit detection**
   - Input: `speed: 5000` → Expected: `speed_kmh: 5` (detected as m/h)
   - Input: `speed: 50` → Expected: `speed_kmh: 50` (detected as km/h)

5. **Coordinate validation**
   - Input: `lat: 0, lon: 0` → Expected: `lat: null, lon: null` (rejected)
   - Input: `lat: 91, lon: 0` → Expected: `lat: null, lon: null` (out of range)

---

## Migration Notes

### Database Schema
No schema changes required. The normalizer works with existing columns:
- `speed` - Now stores km/h (was mixed units)
- `battery_percent` - Now uses voltage mapping when percent missing
- `ignition_on` - Now uses confidence scoring (more accurate)

### Backward Compatibility
- Existing data in database may have mixed speed units
- Normalizer handles both m/h and km/h during reads
- New data is always normalized to km/h

### Performance
- Normalizer is lightweight (no external calls)
- Minimal performance impact
- All normalization happens in-memory

---

## Next Steps

1. **Deploy edge functions** with updated normalizer
2. **Monitor data quality** scores in production
3. **Add unit tests** for edge cases
4. **Consider database migration** to normalize existing speed data (optional)

---

## Files Modified

1. ✅ `supabase/functions/_shared/telemetry-normalizer.ts` (NEW)
2. ✅ `supabase/functions/gps-data/index.ts`
3. ✅ `supabase/functions/gps-history-backfill/index.ts`
4. ✅ `supabase/functions/sync-trips-incremental/index.ts`

---

## Verification

To verify the implementation:

1. **Check normalizer exists:**
   ```bash
   ls supabase/functions/_shared/telemetry-normalizer.ts
   ```

2. **Check imports in functions:**
   ```bash
   grep "telemetry-normalizer" supabase/functions/*/index.ts
   ```

3. **Test speed normalization:**
   - GPS51 returns `speed: 5000` → Should store `speed: 5` (km/h)
   - GPS51 returns `speed: 50` → Should store `speed: 50` (km/h)

4. **Test ignition detection:**
   - `strstatus: "ACC ON"` → `ignition_on: true`
   - `speed: 0, strstatus: null` → `ignition_on: false`

---

**Implementation Status: ✅ COMPLETE**

All functions now use the centralized normalizer. GPS51 data is consistently normalized before storage and exposure.


