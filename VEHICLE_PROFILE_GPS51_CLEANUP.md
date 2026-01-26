# Vehicle Profile – GPS51 Cleanup Summary

**Goal:** Vehicle profile shows **100% GPS51 platform data** for Trip Report, Mileage, Alarm Report; no client-side distance calculations or derivations.

---

## Data Sources (100% GPS51 or GPS51-derived)

| Section | Source | Notes |
|--------|--------|------|
| **Trip Report** | `vehicle_trips` (synced from GPS51 querytrips) | `distance_km`, `start_time`, `end_time`, `avg_speed`, `max_speed`, `duration_seconds` used as-is. |
| **Mileage Report** | `vehicle_daily_stats` view (aggregates `vehicle_trips`), `vehicle_positions.total_mileage` | Daily stats = SUM(distance_km), etc. Total odometer from lastposition. |
| **Fuel Consumption** | `mileage_detail` (fetch-mileage-detail → GPS51) | `oilper100km` = "Actual (GPS51 measured)". |
| **Alarm Report** | `proactive_vehicle_events` | Fleet Heartbeat events (overspeed, low_battery, etc.). Not raw GPS51 alarms API. |

---

## Changes Made

### 1. **useVehicleProfile.ts**
- **Removed** `calculateDistance` (Haversine). No client-side distance calculation.
- **Trip fetch:** Use **only** `trip.distance_km` from DB. Map `distance_km`, `max_speed`, `avg_speed`, `duration_seconds` as-is. If `distance_km` missing → `0`.
- **Reduced** verbose `console.log` in `fetchVehicleTrips`. Kept `console.error` on query failure.
- **JSDoc** on `deriveMileageFromStats`: aggregates `vehicle_daily_stats` (GPS51 `vehicle_trips`). No client-side distance calc.

### 2. **VehicleTrips.tsx** (Fleet)
- **Removed** `calculateDistance` and all fallbacks (speed×duration, 5 km/h min).
- **Fetch:** No coord filters. Only `start_time` / `end_time` required. Use **only** `trip.distance_km`.
- **Display:** `distance_km > 0` → `X.X km`; else `"—"`.

### 3. **ReportsSection** (Vehicle Profile)
- **Removed** dev `console.log` and debug UI (trip count, "Debug: X trips", etc.).
- **Tabs:** "Trip Report" (title: GPS51), "Alarm Report" (title: Fleet Heartbeat). Footer: "Trip Report (GPS51)", "Alarm Report (Fleet Heartbeat)".
- **TripCard distance:** Use **only** `trip.distance_km`. Display `X.X km` or `"—"` when 0. Removed "(est.)".
- **Total trips footer:** `allTripsDistance > 0` → `X.X km`; else `"—"`.
- **Empty states:** "Trips sync from GPS51 platform"; "Alarms from Fleet Heartbeat events".

### 4. **MileageSection**
- **Label:** "Mileage Report (GPS51)".
- **Comment:** `deriveMileageFromStats` uses `vehicle_daily_stats` (GPS51 `vehicle_trips`). Single source of truth.
- **Fuel:** Already "Actual (GPS51 measured)". No change.

### 5. **OwnerVehicleProfile**
- **Removed** dev-only trip logging.
- **Simplified** auto-sync and refresh handlers (removed dev `console.log` / `console.warn` where redundant). Kept `console.error` for refresh failures in dev.

---

## Prohibited Patterns (Removed)

- ~~`calculateDistance` / Haversine in trip code~~
- ~~Distance fallbacks: coords-based, speed×duration, 5 km/h min~~
- ~~`(est.)` or other “estimated” distance labels~~
- ~~Verbose dev logging in hot paths~~

---

## What Stays As-Is

- **`deriveMileageFromStats`:** Aggregates `vehicle_daily_stats` (totals, avgs, etc.). Still **no** coordinate-based distance math; only DB aggregates.
- **Lagos time:** `Africa/Lagos` / `formatToLagosTime` for display. No change.
- **Trip playback:** Still requires valid start/end coords. "GPS incomplete" badge when coords missing.

---

## Files Touched

- `src/hooks/useVehicleProfile.ts`
- `src/components/fleet/VehicleTrips.tsx`
- `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx`
- `src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx`
- `src/pages/owner/OwnerVehicleProfile/index.tsx`
- `VEHICLE_PROFILE_GPS51_CLEANUP.md` (this file)
