# LLM / AI Logic – GPS51 & Fleet Heartbeat Alignment

**Goal:** Vehicle chat AI fetches and uses **correct data** from the same GPS51 / Fleet Heartbeat sources as the vehicle profile (trips, mileage, alarms). No client-side distance derivation; use platform data as-is.

---

## Changes Made

### 1. **Validation (vehicle-chat index.ts)**

- **Removed** `haversineDistanceValidator` and the **trip distance cross-check**. We no longer compare `distance_km` to a Haversine-calculated value or flag "Distance mismatch". **GPS51 `distance_km` is the source of truth.**
- **`validateTrip`**
  - Still validates: missing/invalid times, negative distance/duration, invalid coords, duplicates.
  - **Relaxed:** "Missing or zero start/end coordinates" no longer downgrades to low quality; GPS51 can have 0,0. Only invalid ranges (e.g. |lat| > 90) still reduce quality.
  - **Removed:** Any check that recalculates or disputes `distance_km`.
- **`crossValidate`**
  - **Removed** the trip-vs-position "Distance mismatch" warning. We do not compare trip totals to position-derived distance. Kept date-boundary checks (earliest/latest trip vs requested range).

### 2. **Date-specific stats (historical queries)**

- **Prefer GPS51 trips for distance.** When `dateSpecificTrips.length > 0`:
  - `totalDistance` = sum of `t.distance_km` (GPS51).
  - `movementDetected` uses trip total and/or position speed.
- **Position fallback only when no trips.** When there are **no** trips but we have `dateSpecificPositions`:
  - `totalDistance` = `calculateDistanceFromHistory(dateSpecificPositions)` (position chain).
  - Prompt states: *"Total Distance: X km (from position history fallback; no vehicle_trips)"* so the AI knows it’s not GPS51 trip data.

### 3. **Intent-based data fetching**

- **`stats` or `trip` intent:** Fetch **`vehicle_daily_stats`** (GPS51, from `vehicle_trips`):
  - Aggregate today / this week / last 30 days (distance + trip count).
  - Inject **"MILEAGE (GPS51 – vehicle_daily_stats)"** into the system prompt with these figures.
- **`maintenance` intent:** Fetch **`proactive_vehicle_events`** (Fleet Heartbeat):
  - Last 20 events (device_id), ordered by `created_at` desc.
  - Inject **"RECENT ALARMS (Fleet Heartbeat – proactive_vehicle_events)"** into the system prompt (event type, title, message, severity, timestamp).

### 4. **System prompt**

- **"DATA SOURCES"** section (always present):
  - **Trips & mileage:** GPS51 (`vehicle_trips`, `vehicle_daily_stats`, `vehicle_positions.total_mileage`). Use `distance_km` and totals **as-is**; do not derive or estimate.
  - **Alarms & maintenance:** Fleet Heartbeat (`proactive_vehicle_events`, maintenance recommendations). Use for alerts/health.
- **Conditional blocks:**
  - **MILEAGE (GPS51):** When `dailyStatsForPrompt` exists (stats/trip intents). Today / week / 30d km and trip count.
  - **RECENT ALARMS (Fleet Heartbeat):** When `recentAlarmsForPrompt` exists (maintenance intent). Up to 8 recent events.
- **Historical, trips-only branch:** Uses `dateSpecificTrips.reduce(..., distance_km)`; already GPS51.
- **Historical, position-only branch:** Clarifies "from position history fallback; no vehicle_trips" and "Prefer GPS51 trip data when available."

---

## Data flow summary

| User intent   | Extra fetch                         | Prompt blocks                                      |
|---------------|-------------------------------------|----------------------------------------------------|
| `location`    | —                                   | DATA SOURCES, REAL-TIME STATUS                     |
| `trip`        | `vehicle_daily_stats`               | DATA SOURCES, MILEAGE (GPS51), REAL-TIME STATUS    |
| `stats`       | `vehicle_daily_stats`               | DATA SOURCES, MILEAGE (GPS51), REAL-TIME STATUS    |
| `maintenance` | `proactive_vehicle_events`          | DATA SOURCES, RECENT ALARMS (Fleet Heartbeat), …   |
| `history`     | —                                   | Date-specific trips (GPS51) or position fallback   |

---

## Files touched

- `supabase/functions/vehicle-chat/index.ts`: validation, date-specific stats, intent-based fetches, DATA SOURCES + MILEAGE + RECENT ALARMS in system prompt.
- `LLM_GPS51_IMPROVEMENTS.md` (this file).

`data-validator.ts` and `date-extractor.ts` are **unchanged**. Index uses its **inlined** validation and `calculateDistanceFromHistory` only for the position fallback when there are no trips.
