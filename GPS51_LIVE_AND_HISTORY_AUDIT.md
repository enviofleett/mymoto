# GPS51 LIVE & History Data Audit

**Date:** 2026-01-24  
**Scope:** All logic connecting to LIVE data and history data from GPS51 (vehicle_positions, vehicle_trips, vehicle_daily_stats, trip_sync_status) and Fleet Heartbeat (proactive_vehicle_events).  
**Goal:** Confirm we use the same GPS51-backed sources consistently and are **good to go LIVE**.

---

## 1. Data Sources (GPS51 vs Fleet Heartbeat)

| Source | Table / View | Populated By | Used For |
|--------|--------------|--------------|----------|
| **GPS51 LIVE** | `vehicle_positions` | `gps-data` Edge Function (cron :00, :15, :30, :45) | Live map, position, ignition, speed, last update/GPS fix, total mileage |
| **GPS51 History** | `vehicle_trips` | `sync-trips-incremental` Edge Function (cron :05, :20, :35, :50) | Trip report, distance_km |
| **GPS51 Aggregates** | `vehicle_daily_stats` (view over `vehicle_trips`) | Server-side | Mileage report, daily stats |
| **GPS51 Aggregates** | `get_vehicle_mileage_stats` / `get_daily_mileage` RPCs | Read from `vehicle_trips` | Mileage stats, daily mileage charts |
| **Trip Sync State** | `trip_sync_status` | `sync-trips-incremental` | "Processing…", "Last synced" (trips), progress |
| **Fleet Heartbeat** | `proactive_vehicle_events` | Triggers / other services | Alarm report, AI maintenance context |

---

## 2. LIVE Data Flow

### 2.1 Vehicle profile (OwnerVehicleProfile)

| UI / Hook | Data | Source | Update Mechanism |
|-----------|------|--------|------------------|
| **ProfileHeader** | Last synced, Last update, Last GPS fix | `vehicle_positions` (gps_time, gps_fix_time, last_synced_at) | `useVehicleLiveData` + `useRealtimeVehicleUpdates` |
| **VehicleMapSection** | Lat/lng, heading, speed, address | `vehicle_positions` | Same |
| **CurrentStatusCard** | Status, speed, parked since | `vehicle_positions` + `vehicle_trips` (last trip end) | Same |
| **EngineControlCard** | Ignition, battery, total mileage | `vehicle_positions` | Same |
| **StatusMetricsRow** | Battery, mileage | `vehicle_positions` | Same |

- **useVehicleLiveData:** Reads `vehicle_positions`; 15s poll, 30s stale, refetch on focus, background polling.
- **useRealtimeVehicleUpdates:** Subscribes to `vehicle_positions` UPDATE; updates `vehicle-live-data` cache. **forceEnable: true** on profile → always on regardless of feature flag.

**Verdict:** LIVE profile data is **100%** from `vehicle_positions` (GPS51 via `gps-data`). ✅

### 2.2 Trip report (ReportsSection)

| UI | Data | Source | Update Mechanism |
|----|------|--------|------------------|
| Trip list, distance, duration | `vehicle_trips` | GPS51 via sync | `useVehicleTrips` (live: true) + `useRealtimeTripUpdates` |
| "Processing…", progress | `trip_sync_status` | sync-trips-incremental | `useTripSyncStatus` + `useRealtimeTripUpdates` |
| "Last synced" (trips) | `trip_sync_status.last_sync_at` | Same | Same |

- **useVehicleTrips** (profile): `live: true` → 30s poll, 30s stale, background refetch.
- **useRealtimeTripUpdates:** Subscribes to `vehicle_trips` INSERT and `trip_sync_status` *; on sync **completed** / **error** invalidates trips + daily stats + mileage; on INSERT, debounced invalidate (800ms).

**Gap:** `vehicle_trips` and `trip_sync_status` are **not** in the Supabase Realtime publication.  
→ Realtime subscriptions **never receive** INSERT/UPDATE events. Live trip updates rely **only** on:
- 30s polling (`useVehicleTrips` live),
- Manual sync `onSuccess` invalidate,
- Pull-to-refresh / auto-sync invalidate.

Cron sync completion does **not** trigger instant UI refresh today.

**Verdict:** Trip report uses GPS51 `vehicle_trips` + `trip_sync_status` correctly, but **Realtime for trips is not active** until those tables are added to the publication. ⚠️

### 2.3 Mileage (MileageSection)

| UI | Data | Source | Update Mechanism |
|----|------|--------|------------------|
| Today / week / month, trip counts | `vehicle_daily_stats` or `get_vehicle_mileage_stats` | GPS51 `vehicle_trips` | `useMileageStats`, `useVehicleDailyStats`, `useDailyMileage` |
| Charts | `get_daily_mileage` | Same | Same |

Invalidated with trip report (vehicle-trips, vehicle-daily-stats, mileage-stats, daily-mileage) on sync complete and debounced trip INSERT.

**Verdict:** Mileage is **100%** GPS51-derived (`vehicle_trips`). ✅

### 2.4 Alarm report (ReportsSection)

| UI | Data | Source | Update Mechanism |
|----|------|--------|------------------|
| Alarms / notifications | `proactive_vehicle_events` | Fleet Heartbeat | `useVehicleEvents` |
| Realtime toasts | Same | Same | `useRealtimeVehicleUpdates` (proactive_vehicle_events INSERT) |

**Verdict:** Alarms are Fleet Heartbeat; Realtime for new events is enabled. ✅

---

## 3. Fleet Page

| UI / Hook | Data | Source | Update Mechanism |
|-----------|------|--------|------------------|
| Map, list, positions | `vehicle_positions` (+ vehicles) | GPS51 | `useFleetData`, `useRealtimeFleetUpdates` |
| Trip report (selected vehicle) | `vehicle_trips` | GPS51 | `useVehicleTrips` (no `live`) |
| Events (selected vehicle) | `proactive_vehicle_events` | Fleet Heartbeat | `useVehicleEvents` |

- **useRealtimeFleetUpdates:** Subscribes to `vehicle_positions` UPDATE and `proactive_vehicle_events` INSERT; invalidates `fleet-data` / `vehicle-events`.
- Fleet **does not** use `useRealtimeTripUpdates` or `live: true` for trips → trip list refreshes on manual refetch / tab focus only, not 30s polling.

**Verdict:** LIVE positions and alarms aligned with GPS51 / Fleet Heartbeat. Trip report same **source** as profile but **no live polling** on Fleet. ⚠️ Minor.

---

## 4. Other Consumers

| Consumer | Data | Source | Note |
|----------|------|--------|------|
| **VehicleChat / vehicle-chat** | Trips, mileage, positions, alarms | `vehicle_trips`, `vehicle_daily_stats`, `vehicle_positions`, `proactive_vehicle_events` | Uses GPS51 + Fleet Heartbeat as per LLM improvements. ✅ |
| **RecentActivityFeed** | Activity | `position_history` **first**, `vehicle_positions` **fallback** | When `position_history` has data, feed is **not** purely GPS51. `position_history` is typically telemetry/webhook. ⚠️ |
| **Profile (user vehicles)** | List with positions | `vehicle_positions` | GPS51. ✅ |
| **VehicleTrips (Fleet)** | Trip list | `vehicle_trips` | GPS51; own query, no live polling. ✅ |

---

## 5. Realtime Publication Status

| Table | In `supabase_realtime`? | Used By |
|-------|--------------------------|---------|
| `vehicle_positions` | ✅ Yes | `useRealtimeVehicleUpdates`, `useRealtimeFleetUpdates` |
| `proactive_vehicle_events` | ✅ Yes | Same |
| `vehicle_trips` | ❌ **No** | `useRealtimeTripUpdates` (no events received) |
| `trip_sync_status` | ❌ **No** | Same |

---

## 6. Consistency Summary

- **LIVE (map, position, status):** `vehicle_positions` only → GPS51 via `gps-data`. ✅  
- **History (trips, mileage):** `vehicle_trips` → `vehicle_daily_stats` / RPCs → GPS51 via `sync-trips-incremental`. ✅  
- **Alarms:** `proactive_vehicle_events` → Fleet Heartbeat. ✅  
- **Sync status:** `trip_sync_status` → trip sync only. ✅  

No client-side Haversine or non-GPS51 trip/mileage sources in profile, reports, or mileage.  
**Exception:** RecentActivityFeed uses `position_history` first; when it has data, that part is not GPS51-only.

---

## 7. Gaps & Recommendations

### 7.1 Blocking for “full” LIVE trip report

1. **Add `vehicle_trips` and `trip_sync_status` to Realtime**  
   - Use migration `supabase/migrations/20260126180000_realtime_vehicle_trips_and_sync_status.sql`.  
   - Ensures `useRealtimeTripUpdates` receives INSERT/UPDATE → instant trip list refresh and “Processing…” updates when cron sync completes.

### 7.2 Non-blocking

2. **Fleet trip report**  
   - Add `live: true` to `useVehicleTrips` when showing the selected vehicle’s trips, so Fleet matches profile behaviour (30s polling).

3. **RecentActivityFeed**  
   - If you require “100% GPS51” for all activity: prefer `vehicle_positions` over `position_history`, or clearly label when `position_history` is used.

---

## 8. Go-LIVE Checklist

| Item | Status |
|------|--------|
| LIVE profile (map, status, ignition, mileage) from `vehicle_positions` | ✅ |
| Trip report from `vehicle_trips` (GPS51) | ✅ |
| Mileage from `vehicle_daily_stats` / RPCs (GPS51) | ✅ |
| Alarms from `proactive_vehicle_events` (Fleet Heartbeat) | ✅ |
| Realtime for positions + alarms | ✅ |
| Realtime for trips + sync status | ⚠️ **Add migration** |
| 30s polling for trips on profile | ✅ |
| No client-side distance calc; `distance_km` from DB | ✅ |
| Pull-to-refresh + auto-sync invalidate | ✅ |

**Verdict:** You are **good to go LIVE** for LIVE data and GPS51 history **provided** you run the Realtime migration for `vehicle_trips` and `trip_sync_status`. Without it, trip report stays live via 30s polling and manual/auto sync invalidate only; with it, you get instant updates on sync completion and new trip INSERTs.

---

## 9. Migration to Enable Realtime for Trips

Run the migration `supabase/migrations/20260126180000_realtime_vehicle_trips_and_sync_status.sql` via `supabase db push` or SQL Editor, then verify Realtime subscriptions for `vehicle_trips` and `trip_sync_status` in the dashboard.
