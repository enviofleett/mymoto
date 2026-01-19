# GPS51 API Reference - Ignition & Trip Detection

## Section 4.1: Last Position API Response

### Fields Related to Ignition Detection

```typescript
interface LastPositionResponse {
  // === IGNITION STATUS FIELDS ===
  status: number;           // ⭐ JT808 protocol status bits (PRIMARY SOURCE)
                           // This is a bit field where each bit represents a status flag
                           // Bit 0 (0x01) = ACC state: 0=OFF, 1=ON
                           // Example: status=1 means ACC ON, status=0 means ACC OFF

  strstatus: string;       // Human-readable status description (FALLBACK)
                           // Examples: "ACC ON, GPS", "ACC OFF", "ACC ON, Fortify"
                           // Format varies by device/firmware

  // === LOCATION FIELDS ===
  callat: number;          // Calculated latitude (WGS84)
  callon: number;          // Calculated longitude (WGS84)
  updatetime: number;      // GPS time in milliseconds (UTC)

  // === MOVEMENT FIELDS ===
  speed: number;           // Speed in meters per hour (m/h) - NOT km/h!
  course: number;          // Direction angle (0-360 degrees)
  moving: number;          // 0=stopped, 1=moving

  // === OTHER FIELDS ===
  deviceid: string;        // Device ID
  totaldistance: number;   // Total mileage in meters
  voltagepercent: number;  // Battery percentage (0-100)
  currentoverspeedstate: number; // 1=overspeeding, 2=no overspeed

  // ... many other fields
}
```

### Example Response

```json
{
  "status": 1,
  "strstatus": "ACC ON, GPS",
  "deviceid": "358657105967694",
  "callat": 23.123456,
  "callon": 113.123456,
  "speed": 45000,
  "updatetime": 1705488000000,
  "moving": 1,
  "totaldistance": 1234567
}
```

### Parsing Ignition from Status Bits (JT808 Protocol)

```typescript
// JT808 Protocol Bit Layout (Common Implementation)
// Bit 0 (0x01): ACC state (0=OFF, 1=ON)
// Bit 1 (0x02): Positioning status (0=not positioned, 1=positioned)
// Bit 2 (0x04): Latitude type (0=north, 1=south)
// Bit 3 (0x08): Longitude type (0=east, 1=west)
// ... other bits for various statuses

// Extract ACC bit
const ACC_BIT_MASK = 0x01;
const isAccOn = (status & ACC_BIT_MASK) !== 0;

// Examples:
// status = 0  (binary: 0000) → ACC OFF
// status = 1  (binary: 0001) → ACC ON
// status = 3  (binary: 0011) → ACC ON + GPS Positioned
// status = 5  (binary: 0101) → ACC ON + Different flag
```

---

## Section 6.1: Query Trips API

### Request Format

```typescript
interface QueryTripsRequest {
  deviceid: string;        // Device ID
  begintime: string;       // Start time: "yyyy-MM-dd HH:mm:ss"
  endtime: string;         // End time: "yyyy-MM-dd HH:mm:ss"
  timezone: number;        // Timezone offset (e.g., 8 for GMT+8)
}
```

### Response Format

```typescript
interface QueryTripsResponse {
  status: number;          // 0=success, other=error
  cause: string;           // "OK" or error message
  deviceid: string;
  totalmaxspeed: number;   // Max speed across all trips (m/h)
  totaldistance: number;   // Total distance across all trips (meters)
  totalaveragespeed: number; // Average speed across all trips (m/h)
  totaltriptime: number;   // Total trip time (milliseconds)
  totaltrips: TripRecord[]; // Array of trip records
}

interface TripRecord {
  // === TIME FIELDS ===
  starttime: number;       // Trip start timestamp (ms)
  endtime: number;         // Trip end timestamp (ms)

  // Or alternatively (depending on API version):
  starttime_str: string;   // "yyyy-MM-dd HH:mm:ss"
  endtime_str: string;     // "yyyy-MM-dd HH:mm:ss"

  // === LOCATION FIELDS ===
  startlat: number;        // Start latitude
  startlon: number;        // Start longitude
  endlat: number;          // End latitude
  endlon: number;          // End longitude

  // === DISTANCE & SPEED ===
  distance: number;        // Trip distance in METERS
  totaldistance: number;   // Alternative field for distance (meters)
  maxspeed: number;        // Max speed in METERS PER HOUR (m/h)
  avgspeed: number;        // Average speed in METERS PER HOUR (m/h)

  // === OTHER ===
  // ... other fields may be present
}
```

### Important Conversions

```typescript
// GPS51 uses METERS and METERS/HOUR - must convert!

// Distance: meters → kilometers
const distanceKm = distanceMeters / 1000;

// Speed: meters/hour → kilometers/hour
const speedKmh = speedMh / 1000;

// Example:
// GPS51 returns: distance = 5432 (meters)
// We store: distance_km = 5.432

// GPS51 returns: maxspeed = 72000 (m/h)
// We store: max_speed = 72 (km/h)
```

### Trip Logic (How GPS51 Calculates Trips)

GPS51 defines trips based on **ACC (ignition) state changes**:

1. **Trip Start:** ACC turns ON (status bit 0 changes from 0 → 1)
2. **Trip End:** ACC turns OFF (status bit 0 changes from 1 → 0)
3. **Trip Data:** All GPS points between start and end are aggregated

```
Timeline:
─────────●══════════════════════●─────────●═══════════════●─────
         ↑                      ↑         ↑               ↑
         ACC ON                 ACC OFF   ACC ON          ACC OFF
         (Trip 1 Start)         (Trip 1 End) (Trip 2 Start) (Trip 2 End)

         |←──── Trip 1 ─────→|           |←─── Trip 2 ──→|
```

---

## Section 6.3: ACC Report API (reportaccsbytime)

### Purpose
Get **precise ignition state changes** with timestamps and coordinates.
This is the **authoritative source** for ACC state changes - the same data GPS51 uses to calculate trips.

### Request Format

```typescript
interface AccReportRequest {
  deviceids: string[];     // Array of device IDs
  starttime: string;       // Start time: "yyyy-MM-dd HH:mm:ss"
  endtime: string;         // End time: "yyyy-MM-dd HH:mm:ss"
  offset: number;          // Timezone offset (default: 8 for GMT+8)
}
```

### Response Format

```typescript
interface AccReportResponse {
  status: number;          // 0=success
  cause: string;           // "OK" or error message
  records: AccRecord[];    // Array of ACC state changes
}

interface AccRecord {
  accstateid: number;      // Unique ID for this ACC state record

  accstate: number;        // ⭐ EXPLICIT ACC STATE
                           // 2 = ACC OFF
                           // 3 = ACC ON

  begintime: number;       // State change start time (milliseconds)
  endtime: number;         // State change end time (milliseconds)

  slat: number;            // Start latitude (where state changed)
  slon: number;            // Start longitude
  elat: number;            // End latitude (where state ended)
  elon: number;            // End longitude
}
```

### Example Response

```json
{
  "status": 0,
  "cause": "OK",
  "records": [
    {
      "accstateid": 123456,
      "accstate": 3,              // ACC ON
      "begintime": 1704067200000,  // 2024-01-01 08:00:00
      "endtime": 1704070800000,    // 2024-01-01 09:00:00
      "slat": 23.123456,
      "slon": 113.123456,
      "elat": 23.234567,
      "elon": 113.234567
    },
    {
      "accstateid": 123457,
      "accstate": 2,              // ACC OFF
      "begintime": 1704070800000,  // 2024-01-01 09:00:00
      "endtime": 1704074400000,    // 2024-01-01 10:00:00
      "slat": 23.234567,
      "slon": 113.234567,
      "elat": 23.234567,
      "elon": 113.234567
    }
  ]
}
```

### Usage Example

```typescript
// Call ACC Report API
const result = await callGps51Api('reportaccsbytime', {
  deviceids: ['358657105967694'],
  starttime: '2024-01-17 00:00:00',
  endtime: '2024-01-17 23:59:59',
  offset: 8
});

// Parse results
const accChanges = result.records.map(rec => ({
  accState: rec.accstate === 3 ? 'ON' : 'OFF',
  startTime: new Date(rec.begintime),
  endTime: new Date(rec.endtime),
  startLat: rec.slat,
  startLon: rec.slon,
  endLat: rec.elat,
  endLon: rec.elon
}));

// Output:
// [
//   { accState: 'ON', startTime: 2024-01-17 08:00:00, ... },
//   { accState: 'OFF', startTime: 2024-01-17 09:00:00, ... }
// ]
```

### Benefits Over String Parsing

| Method | Accuracy | Reliability | Coordinates | Timestamps |
|--------|----------|-------------|-------------|------------|
| **String Parsing** (`strstatus`) | ⚠️ Low | Fragile | ❌ No | ⚠️ Approximate |
| **Status Bit** (`status` field) | ✅ High | Good | ❌ No | ⚠️ Approximate |
| **ACC Report API** (`reportaccsbytime`) | ✅✅ Very High | Excellent | ✅ Yes | ✅ Precise |

---

## Common Issues & Solutions

### Issue 1: Ignition Always Shows OFF

**Symptom:**
```sql
SELECT ignition_on, COUNT(*)
FROM position_history
GROUP BY ignition_on;

-- Result:
-- false | 10000
-- true  | 0
```

**Cause:** String parsing is failing because `strstatus` format is unexpected.

**Solution:**
1. Check actual `strstatus` values:
   ```sql
   SELECT DISTINCT strstatus FROM position_history LIMIT 20;
   ```

2. Use `status` bit field instead:
   ```typescript
   const ignition = (record.status & 0x01) !== 0;
   ```

### Issue 2: Trips Not Detected

**Symptom:**
```sql
SELECT COUNT(*) FROM vehicle_trips WHERE start_time >= NOW() - INTERVAL '7 days';
-- Result: 0 or very few
```

**Cause:** Ignition detection is broken, so trip boundaries aren't detected.

**Solution:**
1. Fix ignition detection first (see above)
2. Use ACC Report API to get authoritative state changes
3. Re-sync trips using corrected ignition data

### Issue 3: Speed/Distance Values Wrong

**Symptom:**
- Speed shows as 72000 km/h instead of 72 km/h
- Distance shows as 5432 km instead of 5.432 km

**Cause:** Not converting from GPS51's meter-based units.

**Solution:**
```typescript
// GPS51 API returns meters and m/h
const speedKmh = speedMh / 1000;      // m/h → km/h
const distanceKm = distanceM / 1000;   // m → km
```

---

## Testing Checklist

### Test 1: Verify Status Bit Parsing

```sql
-- Get sample of status values
SELECT
  device_id,
  status,
  strstatus,
  ignition_on,
  speed,
  moving
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour'
ORDER BY gps_time DESC
LIMIT 20;
```

**Expected:**
- `status` values should be small integers (0, 1, 3, 5, 7, etc.)
- `ignition_on` should match: status & 0x01
- Mix of true/false values (not all false)

### Test 2: Verify ACC Report API

```typescript
// Call ACC Report
const result = await fetch('https://your-project.supabase.co/functions/v1/gps-acc-report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    device_ids: ['YOUR_DEVICE_ID'],
    start_date: '2024-01-17 00:00:00',
    end_date: '2024-01-18 00:00:00'
  })
});

const data = await result.json();
console.log('ACC changes:', data.records);
```

**Expected:**
- Returns array of ACC state changes
- Each record has `acc_state` = 'ON' or 'OFF'
- Timestamps align with actual vehicle usage

### Test 3: Verify Trip Detection

```sql
-- Check trips after fix
SELECT
  device_id,
  start_time,
  end_time,
  distance_km,
  max_speed,
  EXTRACT(EPOCH FROM (end_time - start_time))/60 AS duration_minutes
FROM vehicle_trips
WHERE start_time >= NOW() - INTERVAL '24 hours'
ORDER BY start_time DESC
LIMIT 10;
```

**Expected:**
- Multiple trips detected
- Distance values in reasonable range (0.1 - 500 km)
- Speed values reasonable (0 - 150 km/h)
- Duration matches expected trip times

---

## Quick Reference: Unit Conversions

```typescript
// GPS51 → Our Database

// Distance
meters → km:        value / 1000
km → meters:        value * 1000

// Speed
m/h → km/h:         value / 1000
km/h → m/h:         value * 1000

// Time
milliseconds → ISO: new Date(value).toISOString()
ISO → milliseconds: new Date(value).getTime()

// Temperature
GPS51 temp → °C:    value / 10
°C → GPS51:         value * 10

// Voltage
GPS51 voltage → V:  value / 100
V → GPS51:          value * 100
```

---

## JT808 Status Bits Reference

```
Bit Position | Mask | Meaning
-------------|------|----------------------------------
Bit 0        | 0x01 | ACC: 0=OFF, 1=ON
Bit 1        | 0x02 | Positioning: 0=not positioned, 1=positioned
Bit 2        | 0x04 | Latitude: 0=north, 1=south
Bit 3        | 0x08 | Longitude: 0=east, 1=west
Bit 4        | 0x10 | Operating status: 0=stopped, 1=running
Bit 5        | 0x20 | Latitude/Longitude encrypted
Bit 6-7      | 0xC0 | Reserved
Bit 8        | 0x100| Loaded: 0=empty, 1=loaded
Bit 9        | 0x200| Fuel cutoff: 0=normal, 1=cutoff
Bit 10       | 0x400| Circuit cutoff: 0=normal, 1=cutoff
Bit 11       | 0x800| Door: 0=locked, 1=unlocked
```

**Example Status Parsing:**

```typescript
function parseJT808Status(status: number) {
  return {
    accOn: !!(status & 0x01),
    positioned: !!(status & 0x02),
    latSouth: !!(status & 0x04),
    lonWest: !!(status & 0x08),
    running: !!(status & 0x10),
    encrypted: !!(status & 0x20),
    loaded: !!(status & 0x100),
    fuelCutoff: !!(status & 0x200),
    circuitCutoff: !!(status & 0x400),
    doorUnlocked: !!(status & 0x800)
  };
}

// Example:
const status = 19; // Binary: 0000 0000 0001 0011
const parsed = parseJT808Status(status);
// Result:
// {
//   accOn: true,         // Bit 0 = 1
//   positioned: true,    // Bit 1 = 1
//   latSouth: false,     // Bit 2 = 0
//   lonWest: false,      // Bit 3 = 0
//   running: true,       // Bit 4 = 1
//   ...
// }
```

---

## Additional Resources

- **GPS51 API Base URL:** `https://api.gps51.com/openapi`
- **HTTP Method:** POST (all endpoints)
- **Content-Type:** `application/json`
- **Authentication:** Token in query string: `?action=XXX&token=XXX&serverid=XXX`
- **Token Validity:** 24 hours
- **Rate Limits:** ~3 calls per second (conservative)

---

This reference should help you understand exactly how to parse ignition states and work with GPS51's trip data correctly.
