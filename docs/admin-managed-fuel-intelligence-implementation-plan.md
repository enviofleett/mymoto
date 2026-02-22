# Admin-Managed Fuel Intelligence System: Senior Engineering Review & Recommended Implementation

## Executive summary

The core foundations are already present:

- A canonical catalog table (`vehicle_fuel_specs_catalog`) exists and is already being seeded.
- Vehicle-level profile fields (`make`, `model`, `year`, `official_fuel_efficiency_l_100km`) already exist in `vehicles`.
- Trip analytics computation is centralized in one edge function (`analyze-completed-trip`).

However, the requested system needs **schema expansion**, **fuzzy matching + inheritance automation**, and **analytics enrichment** that do not yet exist.

This document recommends a production-safe sequence with concrete logic and migration boundaries.

---

## Current-state observations (from codebase)

1. Catalog currently stores a single combined official efficiency metric (`official_fuel_efficiency_l_100km`), not city/highway/idle split rates.
2. Existing catalog lookup/backfill uses exact normalized key matching (`lower(trim(make)) || '|' || lower(trim(model))`) rather than fuzzy trigram matching.
3. `analyze-completed-trip` currently computes driving behavior metrics (driver score + harsh events) and inserts into `trip_analytics`, but does not compute `total_fuel_consumed` or `estimated_cost`.
4. Owner vehicle specifications UI still allows manual entry of manufacturer fuel values.

---

## Recommended target architecture

### A. Data model (catalog + vehicle linkage)

Add fields to `vehicle_fuel_specs_catalog`:

- `city_consumption_rate NUMERIC(6,3)` — L/100km
- `highway_consumption_rate NUMERIC(6,3)` — L/100km
- `idle_consumption_rate NUMERIC(6,3)` — L/hour
- `year_start INT`, `year_end INT` (or `int4range`) for year matching
- Keep existing `official_fuel_efficiency_l_100km` for compatibility during rollout

Add fields to `vehicles`:

- `fuel_profile_id UUID REFERENCES vehicle_fuel_specs_catalog(id)`
- `fuel_metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- Optional: `fuel_profile_match_confidence NUMERIC(5,4)`
- Optional: `fuel_profile_match_method TEXT` (`exact`, `fuzzy_make_model`, `fuzzy_with_year`)

Why JSONB + FK together:

- FK gives traceability/version source.
- JSONB gives immutable-at-match snapshot for analytics reproducibility.

### B. Matching function and indexing

1. Enable trigram:

- `CREATE EXTENSION IF NOT EXISTS pg_trgm;`

2. Add trigram indexes to avoid full scans:

- `CREATE INDEX ... USING gist (brand gist_trgm_ops)`
- `CREATE INDEX ... USING gist (model gist_trgm_ops)`
- Keep btree index on `(brand, model)` for exact hits.

3. Build deterministic two-phase matcher:

- **Phase 1 (exact):** normalized make/model + year-range filter.
- **Phase 2 (fuzzy fallback):** weighted score using similarity on make/model + year proximity bonus.

Recommended weighted score:

- `score = 0.35*similarity(make) + 0.55*similarity(model) + 0.10*year_score`
- reject match if score `< 0.58` (tune after real telemetry)

Function contract:

- `match_vehicle_to_catalog(p_make text, p_model text, p_year int)`
- return `catalog_id`, `score`, `matched_brand`, `matched_model`, `matched_year_window`

### C. Auto-inheritance trigger on vehicles

Use `AFTER INSERT OR UPDATE OF make, model, year` trigger.

Behavior:

1. Skip if make/model empty.
2. Call `match_vehicle_to_catalog`.
3. If found:
   - set `fuel_profile_id`
   - set `fuel_metadata` to snapshot:
     - `city_consumption_rate`
     - `highway_consumption_rate`
     - `idle_consumption_rate`
     - `catalog_version` (updated_at)
     - `matched_at`, `match_score`
4. If no match:
   - clear `fuel_profile_id`
   - set `fuel_metadata = jsonb_build_object('matched', false)`

Implementation detail: prevent recursion by using a **BEFORE trigger that mutates NEW** _or_ guard conditions in AFTER trigger update.

### D. Bulk re-sync procedure

Create SQL function callable from admin UI:

- `resync_all_vehicle_fuel_profiles(p_limit int default null)`

Implementation choices:

- For large fleets, process in batches via `LIMIT/OFFSET` or cursor loop.
- Return summary JSON (`processed`, `matched`, `unmatched`, `errors`).

This function is what the **Re-sync All Vehicles** button should call (via RPC).

### E. Edge function fuel analytics logic

Enhance `analyze-completed-trip` pipeline:

1. Fetch vehicle row by `device_id` once per trip and read `fuel_metadata`.
2. Partition movement points:
   - city distance from segments with speed `<45`
   - highway distance from segments with speed `>=45`
3. Idle detection:
   - contiguous windows where `speed = 0` and `ignition_on = true`
   - include only windows `>120s`
4. Fuel formula:
   - `city_fuel = city_km * city_rate / 100`
   - `highway_fuel = highway_km * highway_rate / 100`
   - `idle_fuel = idle_hours * idle_rate`
   - `total_fuel_consumed = city_fuel + highway_fuel + idle_fuel`
5. Cost formula:
   - `estimated_cost = total_fuel_consumed * global_fuel_price`
6. Persist into `trip_analytics` new columns:
   - `total_fuel_consumed_l NUMERIC`
   - `estimated_fuel_cost NUMERIC`
   - `fuel_breakdown JSONB`

Data caveat: current `position_history` select in this function does not fetch ignition state. You should source ignition from position telemetry if present, or derive from existing events if not.

### F. Admin UI (catalog CRUD + re-sync)

New page: `src/pages/admin/AdminVehicleCatalog.tsx`

Use `AdminDirectory.tsx` patterns:

- TanStack Query for list + mutations
- `Table` for rows
- `Dialog` for create/edit
- `Button` actions for CRUD + re-sync

Add route guarded with `requireAdmin` and side navigation link.

### G. Owner UX changes

1. `OwnerVehicleProfile`:
   - Show `Verified Fuel Profile` badge if `fuel_profile_id` is not null and metadata is matched.

2. `VehicleSpecificationsForm`:
   - Replace editable manufacturer fuel inputs with read-only inherited values from `fuel_metadata`.
   - Show fallback CTA: **Request Profile Creation** when unmatched.

3. Intelligence dashboard:
   - Add “Fuel Savings” section comparing actual city+idle against highway baseline.

### H. Fallback + request workflow

When unmatched:

- owner can submit request using existing vehicle onboarding request infrastructure.
- include make/model/year and optionally telemetry sample references.
- admin catalog UI should expose pending unmatched requests for curation.

### I. Security and governance

- Keep catalog write operations behind admin-only RLS policies.
- For RPCs (`resync_all_vehicle_fuel_profiles`), use `SECURITY DEFINER` + explicit admin check.
- Log profile assignment changes in audit table (`vehicle_fuel_profile_audit`) for traceability.

---

## Rollout strategy (low risk)

### Phase 1: additive schema

- add new columns only
- no behavior changes yet

### Phase 2: matcher + trigger behind feature flag

- add function/trigger with optional gate (`fuel_profile_auto_match_enabled` setting)

### Phase 3: backfill + admin tools

- run one-time resync job
- enable admin catalog page

### Phase 4: edge analytics enrichment

- deploy new fuel calculations
- backfill recent trips if needed

### Phase 5: owner UX lock-down

- set inherited fields read-only
- keep request fallback enabled

---

## Suggested acceptance criteria

1. New vehicle insert with known make/model/year gets `fuel_profile_id` + complete `fuel_metadata` automatically.
2. Unknown vehicle leaves profile unmatched and allows request submission.
3. Re-sync action updates previously unmatched vehicles after new catalog rows are added.
4. `analyze-completed-trip` writes fuel liters + fuel cost for matched vehicles.
5. Non-admin users cannot access or mutate admin catalog.

---

## Recommendation on your final question

Yes — the **next best step** is to generate the SQL migration package for:

1. catalog/vehicle schema extensions,
2. trigram indexes,
3. `match_vehicle_to_catalog`,
4. inheritance trigger,
5. bulk resync RPC,
6. trip_analytics fuel columns.

That SQL package should be delivered as **small, ordered migrations** (not one giant script) so deployment and rollback are safer.
