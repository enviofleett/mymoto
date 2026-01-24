# Timezone Implementation Guide

## Overview

This document explains how timezones are handled throughout the GPS51 data sync system to ensure all users in Lagos, Nigeria see data in their local time (WAT - West Africa Time, GMT+1).

---

## Timezone Flow

```
GPS51 Platform (GMT+8)
       ↓
  Edge Functions
  (Convert to UTC)
       ↓
Database (UTC Storage)
       ↓
   Frontend
  (Display as GMT+1)
       ↓
User Sees Lagos Time (WAT)
```

---

## Timezones Used

| Zone | Offset | Description | Usage |
|------|--------|-------------|--------|
| **GPS51** | GMT+8 | China Standard Time | GPS51 platform operates in this timezone |
| **UTC** | GMT+0 | Universal Time | Database storage (best practice) |
| **Lagos** | GMT+1 | West Africa Time (WAT) | User display timezone |

---

## Implementation Details

### 1. Backend (Edge Functions)

**Location**: `supabase/functions/_shared/timezone-utils.ts`

**Key Functions**:
- `parseGps51TimestampToUTC()` - Converts GPS51 time (GMT+8) to UTC
- `formatDateForGps51()` - Converts UTC to GPS51 format for API calls
- `formatLagosTime()` - Converts UTC to Lagos time for display

**Example**:
```typescript
// GPS51 returns: "2024-01-24 14:30:00" (GMT+8)
const utcTime = parseGps51TimestampToUTC("2024-01-24 14:30:00");
// Result: "2024-01-24T06:30:00.000Z" (UTC, 8 hours earlier)
```

**Usage in Edge Functions**:
- `sync-gps51-trips`: Converts trip timestamps from GPS51 to UTC
- `sync-gps51-alarms`: Converts alarm timestamps from GPS51 to UTC
- `fetch-mileage-detail`: Date-only, no timezone conversion needed

### 2. Database

**Storage Format**: All timestamps stored in UTC (ISO8601)

**Examples**:
```sql
-- Stored in database (UTC)
start_time: '2024-01-24T06:30:00.000Z'
alarm_time: '2024-01-24T08:15:00.000Z'
```

**Why UTC?**
- Universal standard
- No daylight saving time issues
- Easy to convert to any timezone
- Best practice for distributed systems

### 3. Frontend

**Location**: `src/utils/timezone.ts`

**Key Functions**:
- `formatLagosTime()` - Display UTC as Lagos time
- `formatLagosTimeRelative()` - Show relative time ("2 hours ago")
- `getNowInLagos()` - Get current Lagos time
- `formatDuration()` - Format time durations

**Example**:
```typescript
import { formatLagosTime } from '@/utils/timezone';

// Database returns: "2024-01-24T06:30:00.000Z" (UTC)
const displayTime = formatLagosTime(trip.start_time, 'full');
// User sees: "2024-01-24 07:30:00 WAT" (Lagos time, 1 hour ahead)
```

---

## Conversion Examples

### Example 1: Trip Start Time

**Scenario**: Vehicle started trip at 2:00 PM Lagos time

| Stage | Time | Format | Timezone |
|-------|------|--------|----------|
| GPS51 stores | 21:00:00 | "2024-01-24 21:00:00" | GMT+8 (9 PM China) |
| Edge Function converts | 13:00:00 | "2024-01-24T13:00:00.000Z" | UTC (1 PM) |
| Database stores | 13:00:00 | ISO8601 UTC | UTC |
| Frontend displays | 14:00:00 | "2024-01-24 14:00:00 WAT" | GMT+1 (2 PM Lagos) |

### Example 2: Alarm Timestamp

**Scenario**: Overspeed alarm at 10:30 AM Lagos time

| Stage | Time | Timezone |
|-------|------|----------|
| Actual event | 10:30 AM | Lagos (GMT+1) |
| GPS51 records | 5:30 PM | China (GMT+8) |
| Stored in DB | 9:30 AM | UTC (GMT+0) |
| Displayed to user | 10:30 AM | Lagos (GMT+1) ✅ |

---

## API Query Examples

### Query Last 7 Days of Trips (Lagos Time)

**User Input**: "Show trips from last 7 days"

```typescript
// Frontend calculates Lagos time range
const now = getNowInLagos();  // 2024-01-24 15:00:00 WAT
const start = new Date(now);
start.setDate(start.getDate() - 7);  // 2024-01-17 15:00:00 WAT

// Convert to UTC for database query
const startUTC = convertLagosToUTC(start);  // 2024-01-17T14:00:00.000Z
const endUTC = convertLagosToUTC(now);      // 2024-01-24T14:00:00.000Z

// Query database
const trips = await supabase
  .from('gps51_trips')
  .select('*')
  .gte('start_time', startUTC)
  .lte('start_time', endUTC);

// Display timestamps in Lagos time
trips.forEach(trip => {
  const lagosTime = formatLagosTime(trip.start_time, 'full');
  console.log(lagosTime);  // "2024-01-24 15:30:00 WAT"
});
```

---

## Cron Jobs and Scheduled Tasks

**Cron Configuration**:
```sql
-- Sync trips every 10 minutes
SELECT cron.schedule(
  'sync-gps51-trips-all-vehicles',
  '*/10 * * * *',  -- Runs in server timezone (UTC)
  $$ ... $$
);
```

**Important Notes**:
- Cron schedules use **server timezone** (typically UTC)
- Edge Functions receive UTC timestamps
- Functions convert as needed before calling GPS51 API

---

## Testing Timezone Conversions

### Manual Test

```sql
-- Insert test trip with UTC timestamp
INSERT INTO gps51_trips (device_id, start_time, end_time, distance_meters)
VALUES (
  'TEST_DEVICE',
  '2024-01-24T06:30:00.000Z',  -- 6:30 AM UTC
  '2024-01-24T08:00:00.000Z',  -- 8:00 AM UTC
  15000  -- 15 km
);

-- Frontend should display:
-- Start: 2024-01-24 07:30:00 WAT (6:30 + 1 hour)
-- End:   2024-01-24 09:00:00 WAT (8:00 + 1 hour)
```

### Verification Checklist

- [ ] GPS51 trip time matches database UTC (after 8-hour conversion)
- [ ] Database UTC matches frontend Lagos time (after 1-hour conversion)
- [ ] User sees correct Lagos time (WAT)
- [ ] Relative times work correctly ("2 hours ago")
- [ ] Date ranges query correctly

---

## Common Pitfalls and Solutions

### Pitfall 1: Displaying UTC Directly

❌ **Wrong**:
```typescript
<div>{trip.start_time}</div>
// Shows: "2024-01-24T06:30:00.000Z" (confusing to users)
```

✅ **Correct**:
```typescript
import { formatLagosTime } from '@/utils/timezone';
<div>{formatLagosTime(trip.start_time, 'datetime')}</div>
// Shows: "2024-01-24 07:30:00" (clear Lagos time)
```

### Pitfall 2: Incorrect GPS51 API Query Times

❌ **Wrong**:
```typescript
// Sending Lagos time directly to GPS51 API
const params = {
  begintime: "2024-01-24 00:00:00",  // Lagos time
  timezone: 1  // Wrong!
};
```

✅ **Correct**:
```typescript
import { formatDateForGps51, TIMEZONES } from '../_shared/timezone-utils.ts';

const params = {
  begintime: formatDateForGps51(date, TIMEZONES.UTC),  // Converts to GMT+8
  timezone: TIMEZONES.GPS51  // 8
};
```

### Pitfall 3: Mixing Timezones in Calculations

❌ **Wrong**:
```typescript
// Mixing UTC and Lagos times
const utcStart = new Date(trip.start_time);  // UTC
const lagosEnd = getNowInLagos();  // Lagos
const duration = lagosEnd.getTime() - utcStart.getTime();  // Wrong!
```

✅ **Correct**:
```typescript
// Keep everything in UTC for calculations
const utcStart = new Date(trip.start_time);  // UTC
const utcEnd = new Date(trip.end_time);  // UTC
const duration = utcEnd.getTime() - utcStart.getTime();  // Correct
```

---

## Frontend Components Update

### Before (Displaying UTC)
```typescript
<div className="trip-time">
  {trip.start_time}
</div>
```

### After (Displaying Lagos Time)
```typescript
import { formatLagosTime } from '@/utils/timezone';

<div className="trip-time">
  {formatLagosTime(trip.start_time, 'datetime')}
  <span className="timezone-indicator">WAT</span>
</div>
```

---

## Debugging Timezone Issues

### Enable Logging

In Edge Functions:
```typescript
import { logTimezoneConversion } from '../_shared/timezone-utils.ts';

logTimezoneConversion('Trip Start', gps51Time, utcTime);
// Logs:
//   GPS51 (GMT+8): 2024-01-24 21:00:00
//   UTC (GMT+0): 2024-01-24T13:00:00.000Z
//   Lagos (GMT+1): 2024-01-24 14:00:00 WAT
```

### Verify in Database

```sql
-- Check stored UTC timestamps
SELECT 
  device_id,
  start_time AS utc_time,
  start_time AT TIME ZONE 'Africa/Lagos' AS lagos_time
FROM gps51_trips
LIMIT 5;
```

---

## Summary

| Component | Input Timezone | Output Timezone | Conversion Function |
|-----------|----------------|-----------------|---------------------|
| GPS51 API | GPS51 (GMT+8) | GPS51 (GMT+8) | None (direct) |
| Edge Functions (receive) | GPS51 (GMT+8) | UTC (GMT+0) | `parseGps51TimestampToUTC()` |
| Database | UTC (GMT+0) | UTC (GMT+0) | None (storage) |
| Frontend (display) | UTC (GMT+0) | Lagos (GMT+1) | `formatLagosTime()` |

**Key Principle**: 
- **Storage**: Always UTC
- **Display**: Always Lagos (GMT+1)
- **Calculations**: Always UTC
- **GPS51 API**: Always GMT+8

---

## Migration Notes

If you have existing data with incorrect timezones:

```sql
-- Check if timestamps are already in UTC
SELECT 
  MIN(start_time) as earliest,
  MAX(start_time) as latest
FROM gps51_trips;

-- If times look wrong (e.g., 8 hours off), they might be GPS51 time
-- Migration would be needed (contact support)
```

---

## Further Reading

- [ISO 8601 Timestamp Format](https://en.wikipedia.org/wiki/ISO_8601)
- [UTC vs GMT](https://www.timeanddate.com/time/gmt-utc-time.html)
- [West Africa Time (WAT)](https://www.timeanddate.com/time/zones/wat)

---

**Status**: ✅ Timezone implementation complete
**Version**: 1.0.0
**Last Updated**: 2024-01-24
