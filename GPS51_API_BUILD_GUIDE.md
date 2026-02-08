# GPS51 API Build Guide: Trip, Mileage & Geofence Reports

> Complete implementation guide for generating reports that are **100% compatible** with the GPS51 platform. All data flows directly from GPS51 APIs with no transformations — ensuring exact parity with what you see on gps51.com.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Environment Setup](#2-prerequisites--environment-setup)
3. [GPS51 API Reference](#3-gps51-api-reference)
4. [Authentication & Token Management](#4-authentication--token-management)
5. [Trip Report (`querytrips`)](#5-trip-report-querytrips)
6. [Mileage Report (`reportmileagedetail`)](#6-mileage-report-reportmileagedetail)
7. [Geofence Report (`querygeosystemrecords`)](#7-geofence-report-querygeosystemrecords)
8. [Rate Limiting & Resilience](#8-rate-limiting--resilience)
9. [Timezone Handling](#9-timezone-handling)
10. [Database Schema](#10-database-schema)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐     ┌────────────┐
│   Frontend   │────▶│  Supabase    │────▶│  DigitalOcean Proxy  │────▶│  GPS51 API │
│   (React)    │◀────│  Edge Func   │◀────│  (CORS bypass)       │◀────│  gps51.com │
└──────────────┘     └──────────────┘     └──────────────────────┘     └────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Supabase DB │
                    │  (PostgreSQL)│
                    └──────────────┘
```

**Key principles:**
- GPS51 is the **single source of truth** for all vehicle telemetry
- Data is synced directly from GPS51 APIs with **zero transformations**
- All timestamps are converted: GPS51 (GMT+8) → UTC (database) → Lagos (GMT+1, display)
- Rate limiting is enforced globally to prevent IP blocking (error 8902)

---

## 2. Prerequisites & Environment Setup

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) | `eyJhbGciOi...` |
| `DO_PROXY_URL` | DigitalOcean proxy for GPS51 API calls | `https://your-proxy.ondigitalocean.app/proxy` |
| `GPS_USERNAME` | GPS51 account username | `your_username` |
| `GPS_PASSWORD` | GPS51 account password (plaintext, hashed at runtime) | `your_password` |

### Why a Proxy?

GPS51's API (`api.gps51.com`) does not support CORS headers. A proxy server is required to relay requests from Supabase Edge Functions. The proxy receives a standardized request format:

```json
{
  "targetUrl": "https://api.gps51.com/openapi?action=querytrips&token=xxx&serverid=1",
  "method": "POST",
  "data": { "deviceid": "123456", "begintime": "2026-01-01 00:00:00", "endtime": "2026-01-07 23:59:59" }
}
```

### Shared Dependencies

All edge functions import from two shared modules:

| Module | Path | Purpose |
|--------|------|---------|
| `gps51-client.ts` | `supabase/functions/_shared/gps51-client.ts` | Rate-limited API caller, token management |
| `timezone-utils.ts` | `supabase/functions/_shared/timezone-utils.ts` | GMT+8 → UTC → GMT+1 conversions |

---

## 3. GPS51 API Reference

### Base URL

```
https://api.gps51.com/openapi?action={ACTION}&token={TOKEN}&serverid={SERVERID}
```

All requests use **HTTP POST** with a JSON body. The `action` query parameter determines which API is called.

### Response Format

Every GPS51 API returns:

```json
{
  "status": 0,        // 0 = success, non-zero = error
  "cause": "...",      // Error description (when status != 0)
  "records": [...],    // Data array (varies by action)
  "token": "...",      // Only returned by login action
  "serverid": "..."    // Only returned by login action
}
```

### Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `0` | Success | Process data normally |
| `8902` | IP rate limit exceeded | Back off 60 seconds, retry |
| `9903` | Token expired | Auto-refresh token, retry |
| `9904` | Parameter error | Check request body, do not retry |

---

## 4. Authentication & Token Management

### Login API

**Action:** `login` (no token required)

**Request body:**

```json
{
  "type": "USER",
  "from": "web",
  "username": "your_username",
  "password": "MD5_HASH_OF_PASSWORD",
  "browser": "Chrome/120.0.0.0"
}
```

**Password hashing:** The password must be MD5-hashed before sending:

```typescript
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

async function md5(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const passwordHash = await md5("your_plain_password");
```

**Successful response:**

```json
{
  "status": 0,
  "token": "abc123def456...",
  "serverid": "1"
}
```

### Token Lifecycle

- **Validity:** 24 hours from login
- **Storage:** `app_settings` table with key `gps_token`
- **Auto-refresh:** Triggered when token is within 5 minutes of expiry
- **Buffer:** Token is marked to expire 1 hour early (23-hour effective window)

### Implementation

Token management is handled by `getValidGps51Token()` in the shared client:

```typescript
import { getValidGps51Token } from "../_shared/gps51-client.ts";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const { token, username, serverid } = await getValidGps51Token(supabase);
// token is guaranteed valid — auto-refreshes if needed
```

**Database schema for token storage:**

```sql
-- Stored in app_settings table
-- key: 'gps_token'
-- value: the token string
-- expires_at: ISO8601 timestamp
-- metadata: { serverid, username, refreshed_by, refreshed_at }
```

---

## 5. Trip Report (`querytrips`)

### GPS51 API: Section 6.1

Retrieves individual trip records for a device within a time range. Each trip contains start/end times, coordinates, distance, and speed data — exactly as displayed on the GPS51 platform.

### API Request

**Action:** `querytrips`

**Request body:**

```json
{
  "deviceid": "DEVICE_IMEI",
  "begintime": "2026-01-01 00:00:00",
  "endtime": "2026-01-07 23:59:59",
  "timezone": 8
}
```

| Field | Type | Description |
|-------|------|-------------|
| `deviceid` | string | Device IMEI number |
| `begintime` | string | Start time in `yyyy-MM-dd HH:mm:ss` format (**GMT+8**) |
| `endtime` | string | End time in `yyyy-MM-dd HH:mm:ss` format (**GMT+8**) |
| `timezone` | integer | Timezone offset, always `8` for GPS51 |

### API Response

```json
{
  "status": 0,
  "records": [
    {
      "starttime": 1706096400000,
      "endtime": 1706097600000,
      "starttime_str": "2026-01-24 14:00:00",
      "endtime_str": "2026-01-24 14:20:00",
      "startlat": 6.5244,
      "startlon": 3.3792,
      "endlat": 6.4541,
      "endlon": 3.3947,
      "distance": 12500,
      "totaldistance": 12500,
      "maxspeed": 85000,
      "avgspeed": 45000,
      "totaltriptime": 1200000
    }
  ],
  "totaltrips": [...]
}
```

### Response Field Reference

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `starttime` | number | milliseconds (epoch) | Trip start timestamp |
| `endtime` | number | milliseconds (epoch) | Trip end timestamp |
| `starttime_str` | string | `yyyy-MM-dd HH:mm:ss` (GMT+8) | Trip start as string |
| `endtime_str` | string | `yyyy-MM-dd HH:mm:ss` (GMT+8) | Trip end as string |
| `startlat` / `startlon` | number | decimal degrees | Start coordinates |
| `endlat` / `endlon` | number | decimal degrees | End coordinates |
| `distance` | number | **meters** | Trip distance (accumulated path) |
| `totaldistance` | number | **meters** | Alternative distance field |
| `maxspeed` | number | **meters/hour** | Maximum speed during trip |
| `avgspeed` | number | **meters/hour** | Average speed during trip |
| `totaltriptime` | number | **milliseconds** | Total trip duration |

### Unit Conversions

```
Speed:    GPS51 m/h  ÷ 1000  = km/h
Distance: GPS51 m    ÷ 1000  = km
Duration: GPS51 ms   ÷ 1000  = seconds
```

### Edge Function Implementation

**Function:** `supabase/functions/sync-gps51-trips/index.ts`

**Invocation:**

```bash
curl -X POST https://YOUR_SUPABASE_URL/functions/v1/sync-gps51-trips \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceid": "DEVICE_IMEI",
    "begintime": "2026-01-01T00:00:00Z",
    "endtime": "2026-01-07T23:59:59Z"
  }'
```

**Data flow:**

1. Input dates (UTC) are converted to GPS51 timezone (GMT+8) using `formatDateForGps51()`
2. GPS51 `querytrips` API is called with rate limiting
3. Response timestamps (GMT+8 epoch ms or string) are converted to UTC via `parseGps51TimestampToUTC()`
4. Speeds converted from m/h to km/h (`÷ 1000`)
5. Data upserted into `gps51_trips` table (conflict on `device_id, start_time`)
6. Raw GPS51 response stored in `gps51_raw_data` JSONB column for debugging

**Database mapping:**

| GPS51 Field | DB Column | Conversion |
|-------------|-----------|------------|
| `starttime` / `starttime_str` | `start_time` | GMT+8 → UTC |
| `endtime` / `endtime_str` | `end_time` | GMT+8 → UTC |
| `startlat` | `start_latitude` | None |
| `startlon` | `start_longitude` | None |
| `endlat` | `end_latitude` | None |
| `endlon` | `end_longitude` | None |
| `distance` | `distance_meters` | None (stored as meters) |
| — | `distance_km` | Auto-computed: `distance_meters / 1000` (generated column) |
| `maxspeed` | `max_speed_kmh` | `÷ 1000` |
| `avgspeed` | `avg_speed_kmh` | `÷ 1000` |
| — | `duration_seconds` | `(end_time - start_time) / 1000` |
| (full response) | `gps51_raw_data` | Stored as JSONB |

### Verifying 100% GPS51 Parity

To verify trip data matches GPS51 exactly:

1. Log into [gps51.com](https://www.gps51.com) → Reports → Trip Report
2. Select the same device and date range
3. Compare trip count, distances (km), and max speeds
4. The `gps51_raw_data` column contains the unmodified response for forensic comparison

---

## 6. Mileage Report (`reportmileagedetail`)

### GPS51 API: Section 4.2

Retrieves daily mileage summaries with fuel consumption data. This is the authoritative source for daily distance, fuel usage, efficiency metrics, and fuel theft detection.

### API Request

**Action:** `reportmileagedetail`

**Request body:**

```json
{
  "deviceid": "DEVICE_IMEI",
  "startday": "2026-01-01",
  "endday": "2026-01-07",
  "offset": 8
}
```

| Field | Type | Description |
|-------|------|-------------|
| `deviceid` | string | Device IMEI number |
| `startday` | string | Start date `yyyy-MM-dd` |
| `endday` | string | End date `yyyy-MM-dd` |
| `offset` | integer | Timezone offset (default `8` for GMT+8) |

### API Response

```json
{
  "status": 0,
  "records": [
    {
      "id": 12345,
      "statisticsday": "2026-01-01",
      "begindis": 150000,
      "enddis": 162500,
      "totaldistance": 12500,
      "beginoil": 7500,
      "endoil": 6200,
      "ddoil": 0,
      "idleoil": 150,
      "leakoil": 0,
      "avgspeed": 45000,
      "overspeed": 2,
      "oilper100km": 8.5,
      "runoilper100km": 7.2,
      "oilperhour": 3.1,
      "totalacc": 14400000,
      "starttime": 1706745600000,
      "endtime": 1706788800000
    }
  ]
}
```

### Response Field Reference

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `id` | number | — | GPS51 record ID |
| `statisticsday` | string | `yyyy-MM-dd` | Statistics date |
| `begindis` | integer | **meters** | Odometer at start of day |
| `enddis` | integer | **meters** | Odometer at end of day |
| `totaldistance` | integer | **meters** | Total distance driven that day |
| `beginoil` | integer | **1/100 L** | Fuel level at start of day |
| `endoil` | integer | **1/100 L** | Fuel level at end of day |
| `ddoil` | integer | **1/100 L** | Refueling volume |
| `idleoil` | integer | **1/100 L** | Fuel consumed while idling |
| `leakoil` | integer | **1/100 L** | **Fuel theft amount** (critical) |
| `avgspeed` | integer | **meters/hour** | Average speed |
| `overspeed` | integer | count | Number of overspeed events |
| `oilper100km` | float | **L/100km** | Comprehensive fuel consumption |
| `runoilper100km` | float | **L/100km** | Driving-only fuel consumption |
| `oilperhour` | float | **L/hour** | Fuel consumption rate |
| `totalacc` | integer | **milliseconds** | Total ACC-on time |
| `starttime` | number | ms (epoch) | Day start timestamp |
| `endtime` | number | ms (epoch) | Day end timestamp |

### Unit Conversions

```
Distance:  GPS51 meters    ÷ 1000  = km
Fuel:      GPS51 1/100L    ÷ 100   = liters
Speed:     GPS51 m/h       ÷ 1000  = km/h
ACC time:  GPS51 ms        ÷ 1000  = seconds
                           ÷ 3600  = hours
```

### Fuel Theft Detection

The `leakoil` field is GPS51's built-in fuel theft detection. When `leakoil > 0`, the platform has detected a sudden fuel level drop that does not correspond to consumption:

```typescript
// Alert on fuel theft
const theftAlerts = records.filter(r => r.leakoil && r.leakoil > 0);
if (theftAlerts.length > 0) {
  console.warn(`FUEL THEFT DETECTED: ${theftAlerts.length} events`);
  // leakoil is in 1/100L — divide by 100 for liters stolen
}
```

The database has a partial index for fast theft queries:

```sql
CREATE INDEX idx_mileage_details_fuel_theft
  ON vehicle_mileage_details(device_id, leakoil)
  WHERE leakoil > 0;
```

### Edge Function Implementation

**Function:** `supabase/functions/fetch-mileage-detail/index.ts`

**Invocation:**

```bash
curl -X POST https://YOUR_SUPABASE_URL/functions/v1/fetch-mileage-detail \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceid": "DEVICE_IMEI",
    "startday": "2026-01-01",
    "endday": "2026-01-07"
  }'
```

**Database mapping:**

| GPS51 Field | DB Column | Conversion |
|-------------|-----------|------------|
| `statisticsday` | `statisticsday` | None (DATE) |
| `begindis` | `begindis` | None (meters) |
| `enddis` | `enddis` | None (meters) |
| `totaldistance` | `totaldistance` | None (meters) |
| `beginoil` | `beginoil` | None (1/100L) |
| `endoil` | `endoil` | None (1/100L) |
| `ddoil` | `ddoil` | None (1/100L) |
| `idleoil` | `idleoil` | None (1/100L) |
| `leakoil` | `leakoil` | None (1/100L) |
| `avgspeed` | `avgspeed` | `÷ 1000` → km/h |
| `overspeed` | `overspeed` | None |
| `oilper100km` | `oilper100km` | None (L/100km) |
| `runoilper100km` | `runoilper100km` | None (L/100km) |
| `oilperhour` | `oilperhour` | None (L/h) |
| `totalacc` | `totalacc` | None (ms) |
| `id` | `gps51_record_id` | Cast to string |

**Deduplication:** Upsert on `(device_id, statisticsday, gps51_record_id)`.

### Bonus: Manufacturer-Based Fuel Estimates

The mileage function also enriches records with manufacturer-based fuel consumption estimates from the `vehicle_specifications` table, with age-based degradation:

```
estimated = base_consumption × (1 + degradation_per_year) ^ vehicle_age
```

The `fuel_consumption_variance` column tracks `((actual - estimated) / estimated) × 100`, making it easy to flag vehicles with abnormal consumption.

---

## 7. Geofence Report (`querygeosystemrecords`)

### GPS51 API: Geofence Management

GPS51 provides three geofence actions for full CRUD operations on the platform.

### 7.1 List Geofences

**Action:** `querygeosystemrecords`

**Request body:** `{}` (empty — returns all geofences for the account)

**Response:**

```json
{
  "status": 0,
  "groups": [
    {
      "groupid": "1",
      "groupname": "Default",
      "records": [
        {
          "recordid": "101",
          "name": "Office",
          "type": 1,
          "lat1": 6.5244,
          "lon1": 3.3792,
          "radius1": 500,
          "useas": 0,
          "triggerevent": 0
        }
      ]
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `groupid` | string | Category/group ID |
| `groupname` | string | Category name |
| `recordid` | string | Geofence ID (used for delete) |
| `name` | string | Geofence name |
| `type` | integer | `1` = Circle |
| `lat1` / `lon1` | number | Center coordinates |
| `radius1` | number | Radius in meters |
| `useas` | integer | `0` = Enter/Exit detection |
| `triggerevent` | integer | `0` = Platform notify |

### 7.2 Create Geofence

**Action:** `addgeosystemrecord`

**Request body:**

```json
{
  "name": "My Geofence",
  "categoryid": "1",
  "type": 1,
  "useas": 0,
  "triggerevent": 0,
  "lat1": 6.5244,
  "lon1": 3.3792,
  "radius1": 500
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Geofence display name |
| `categoryid` | string | Category to group under (from `querygeosystemrecords`) |
| `type` | integer | `1` = Circle geofence |
| `useas` | integer | `0` = Enter/Exit detection |
| `triggerevent` | integer | `0` = Platform notification |
| `lat1` | number | Center latitude |
| `lon1` | number | Center longitude |
| `radius1` | number | Radius in meters |

**Response:**

```json
{
  "status": 0,
  "recordid": "102"
}
```

Store the `recordid` in your local database (`gps51_id` column on `geofence_zones`) for future operations.

### 7.3 Delete Geofence

**Action:** `delgeosystemrecord`

**Request body:**

```json
{
  "categoryid": "1",
  "geosystemrecordid": "102"
}
```

Both `categoryid` and `geosystemrecordid` are required. If you don't know the category, query `querygeosystemrecords` first and find the record.

### Edge Function Implementation

**Function:** `supabase/functions/sync-geofences-gps51/index.ts`

**Create invocation:**

```bash
curl -X POST https://YOUR_SUPABASE_URL/functions/v1/sync-geofences-gps51 \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "geofence_id": "UUID_OF_LOCAL_GEOFENCE"
  }'
```

**Delete invocation:**

```bash
curl -X POST https://YOUR_SUPABASE_URL/functions/v1/sync-geofences-gps51 \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "delete",
    "gps51_id": "102"
  }'
```

**Workflow for creating a geofence:**

1. User creates geofence in the app → stored in `geofence_zones` table
2. Edge function reads geofence details from local DB
3. Queries `querygeosystemrecords` to find/create a category
4. Calls `addgeosystemrecord` to create on GPS51
5. Stores returned `recordid` as `gps51_id` in `geofence_zones`

### Building a Geofence Entry/Exit Report

GPS51 does not have a dedicated geofence report API. To generate geofence crossing reports:

**Option A: Use Alarm Data**
GPS51's `lastposition` API returns alarm data. Geofence violations appear as alarms:

```typescript
// Filter alarms for geofence events
const geofenceAlarms = alarms.filter(a =>
  a.alarm_description_en?.includes('fence') ||
  a.alarm_description_en?.includes('Fence')
);
```

**Option B: Build from Trip Data**
Cross-reference trip coordinates against your geofence definitions:

```typescript
function isInsideCircle(lat: number, lon: number, centerLat: number, centerLon: number, radiusMeters: number): boolean {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat - centerLat) * Math.PI / 180;
  const dLon = (lon - centerLon) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(centerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c <= radiusMeters;
}

// Check if trip start/end is inside geofence
const entered = !isInsideCircle(trip.startlat, trip.startlon, fence.lat, fence.lon, fence.radius)
             && isInsideCircle(trip.endlat, trip.endlon, fence.lat, fence.lon, fence.radius);
```

---

## 8. Rate Limiting & Resilience

### Configuration

GPS51 enforces strict IP-based rate limits. The shared client (`gps51-client.ts`) manages this globally:

```
Max calls/second:     3
Min delay between:    350ms
Max burst:            3 calls in 1 second
Max retries:          2
Initial retry delay:  2,000ms
Max retry delay:      60,000ms (1 minute)
Backoff multiplier:   3x
IP limit backoff:     60,000ms (on error 8902)
```

### How It Works

1. **Local rate limiting:** In-memory tracking per function instance
2. **Global rate limiting:** Database-backed state in `app_settings` table (key: `gps51_rate_limit_state`)
3. **Automatic backoff:** Error 8902 triggers 60-second cooldown across all instances
4. **Retry logic:** Exponential backoff with 3x multiplier (`2s → 6s → 18s`)

### Usage

Always use the shared client — never call GPS51 directly:

```typescript
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";

const { token, serverid } = await getValidGps51Token(supabase);

const result = await callGps51WithRateLimit(
  supabase,        // Supabase client (for rate limit state)
  proxyUrl,        // DO_PROXY_URL
  'querytrips',    // API action
  token,           // Auth token
  serverid,        // Server ID
  { deviceid, begintime, endtime, timezone: 8 }  // Request body
);
```

---

## 9. Timezone Handling

### The Three Timezones

| Zone | Offset | Usage |
|------|--------|-------|
| GPS51 (CST) | GMT+8 | API requests & responses |
| UTC | GMT+0 | Database storage (best practice) |
| Lagos (WAT) | GMT+1 | User-facing display |

### Conversion Flow

```
GPS51 (GMT+8) ──[subtract 8h]──▶ UTC (GMT+0) ──[add 1h]──▶ Lagos (GMT+1)
```

### Key Functions

```typescript
import {
  parseGps51TimestampToUTC,   // GPS51 timestamp → UTC ISO string
  formatDateForGps51,          // UTC Date → GPS51 "yyyy-MM-dd HH:mm:ss"
  convertUTCToLagos,           // UTC ISO string → Lagos ISO string
  formatLagosTime,             // UTC ISO string → Lagos display string
  getGps51DateRange,           // Generate begintime/endtime for N days back
  TIMEZONES                    // { GPS51: 8, LAGOS: 1, UTC: 0 }
} from "../_shared/timezone-utils.ts";
```

### Example: Converting a Date Range for API Query

```typescript
// User wants "last 7 days" from Lagos perspective
const now = new Date();
const sevenDaysAgo = new Date(now);
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

// Convert to GPS51 format (adds 8 hours from UTC)
const begintime = formatDateForGps51(sevenDaysAgo, TIMEZONES.UTC);
// "2026-01-01 08:00:00" (if UTC was midnight)

const endtime = formatDateForGps51(now, TIMEZONES.UTC);
// "2026-01-08 08:00:00"
```

### Example: Converting Response Timestamps

```typescript
// GPS51 returns epoch milliseconds (already UTC for numeric)
const utcIso = parseGps51TimestampToUTC(1706096400000);
// "2024-01-24T10:00:00.000Z"

// GPS51 returns string timestamp (in GMT+8)
const utcIso2 = parseGps51TimestampToUTC("2024-01-24 18:00:00");
// "2024-01-24T10:00:00.000Z" (subtracted 8 hours)

// Display in Lagos
const lagosDisplay = formatLagosTime(utcIso, 'full');
// "2024-01-24 11:00:00 WAT" (added 1 hour)
```

---

## 10. Database Schema

### `gps51_trips` — Trip Data

```sql
CREATE TABLE gps51_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL REFERENCES vehicles(device_id),
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  start_latitude numeric,
  start_longitude numeric,
  end_latitude numeric,
  end_longitude numeric,
  distance_meters integer,
  distance_km numeric GENERATED ALWAYS AS (ROUND((distance_meters / 1000.0)::numeric, 2)) STORED,
  avg_speed_kmh numeric,
  max_speed_kmh numeric,
  duration_seconds integer,
  gps51_raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(device_id, start_time)
);
```

### `vehicle_mileage_details` — Mileage Data

```sql
CREATE TABLE vehicle_mileage_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES vehicles(device_id),
  statisticsday DATE NOT NULL,
  starttime BIGINT,
  endtime BIGINT,
  begindis INTEGER,          -- meters
  enddis INTEGER,            -- meters
  totaldistance INTEGER,     -- meters
  beginoil INTEGER,          -- 1/100L
  endoil INTEGER,            -- 1/100L
  ddoil INTEGER,             -- 1/100L (refuel)
  idleoil INTEGER,           -- 1/100L
  leakoil INTEGER,           -- 1/100L (theft!)
  avgspeed FLOAT,            -- km/h (converted from m/h)
  overspeed INTEGER,
  oilper100km FLOAT,         -- L/100km
  runoilper100km FLOAT,      -- L/100km
  oilperhour FLOAT,          -- L/h
  totalacc BIGINT,           -- milliseconds
  gps51_record_id TEXT,
  UNIQUE (device_id, statisticsday, gps51_record_id)
);
```

### `geofence_zones` — Geofence Definitions

```sql
-- Local geofence definitions, synced to GPS51
-- Key column: gps51_id (stores the GPS51 recordid after sync)
```

### `gps51_sync_status` — Sync Tracking

```sql
CREATE TABLE gps51_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE REFERENCES vehicles(device_id),
  last_trip_sync_at timestamptz,
  last_trip_synced timestamptz,
  trips_synced_count integer DEFAULT 0,
  trip_sync_error text,
  sync_status text DEFAULT 'idle', -- idle | syncing | completed | error
  updated_at timestamptz DEFAULT now()
);
```

---

## 11. Troubleshooting

### Common Errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| `status: 8902` | IP rate limit hit | Wait 60s. Reduce concurrent calls. Check global rate limit state. |
| `status: 9903` | Token expired | Token auto-refreshes. If persists, check `GPS_USERNAME` / `GPS_PASSWORD` env vars. |
| `status: 9904` | Bad parameters | Check `deviceid` exists on GPS51 account. Verify date format. |
| No trips returned | Date range in wrong timezone | Ensure dates are converted to GMT+8 for the API. Use `formatDateForGps51()`. |
| Distance/speed mismatch | Wrong unit conversion | GPS51 uses **m/h** (not km/h) and **meters** (not km). Divide by 1000. |
| Duplicate records | Missing conflict handling | Always upsert with `onConflict` clause matching the UNIQUE constraint. |
| Empty `leakoil` | Device has no fuel sensor | Only devices with fuel sensors report fuel data. |
| Proxy errors | DO_PROXY_URL misconfigured | Verify the proxy is running and accepts `{ targetUrl, method, data }` format. |

### Debugging Checklist

1. **Check token validity:** Query `app_settings` where `key = 'gps_token'` — verify `expires_at` is in the future
2. **Check rate limit state:** Query `app_settings` where `key = 'gps51_rate_limit_state'` — verify `backoff_until` is in the past
3. **Check sync status:** Query `gps51_sync_status` for the device — look at `sync_status` and error fields
4. **Check raw data:** Query `gps51_trips.gps51_raw_data` for the exact GPS51 response
5. **Compare with GPS51 UI:** Log into [gps51.com](https://www.gps51.com) and compare data side-by-side

### Quick Reference: All GPS51 API Actions

| Action | Purpose | Edge Function |
|--------|---------|---------------|
| `login` | Authentication | `gps51-user-auth` |
| `querytrips` | Trip reports | `sync-gps51-trips`, `sync-official-reports` |
| `reportmileagedetail` | Mileage reports | `fetch-mileage-detail`, `sync-official-reports` |
| `reportaccsbytime` | ACC/Ignition reports | `gps-acc-report` |
| `lastposition` | Real-time position + alarms | `sync-gps51-alarms` |
| `querygeosystemrecords` | List geofences | `sync-geofences-gps51` |
| `addgeosystemrecord` | Create geofence | `sync-geofences-gps51` |
| `delgeosystemrecord` | Delete geofence | `sync-geofences-gps51` |
| `sendcommand` | Vehicle commands | (engine cut, etc.) |

---

## File Reference

| File | Purpose |
|------|---------|
| `supabase/functions/_shared/gps51-client.ts` | Shared GPS51 API client with rate limiting |
| `supabase/functions/_shared/timezone-utils.ts` | Timezone conversion utilities |
| `supabase/functions/sync-gps51-trips/index.ts` | Trip report sync |
| `supabase/functions/fetch-mileage-detail/index.ts` | Mileage report fetch |
| `supabase/functions/sync-official-reports/index.ts` | Combined trip + mileage sync |
| `supabase/functions/sync-geofences-gps51/index.ts` | Geofence CRUD sync |
| `supabase/functions/gps-acc-report/index.ts` | ACC/Ignition report |
| `supabase/functions/gps51-user-auth/index.ts` | Authentication |
| `supabase/migrations/20260124000000_create_gps51_sync_tables.sql` | Trip + alarm + sync tables |
| `supabase/migrations/20260119000001_create_mileage_detail_table.sql` | Mileage detail table |
