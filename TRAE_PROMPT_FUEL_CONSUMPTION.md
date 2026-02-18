# Trae AI Prompt — End-to-End Fuel Consumption Intelligence (Manufacturer Baseline + Trip Analytics)

You are working in the MyMoto repository (React + Supabase Edge Functions + Postgres).

## Objective
Implement a complete fuel-consumption intelligence workflow that:
1. Computes **fuel consumption per trip** using manufacturer baseline values in **L/100km** (and provide derived **km/L** when needed).
2. Supports multiple vehicle classes: **bike, tricycle, car, mini van, bus**.
3. Covers vehicles manufactured from **2001 to 2016**.
4. Captures all required inputs on the **Vehicle Settings** page so the system can calculate fuel metrics for all brands.
5. Feeds this data into **vehicle agents** (chat/tools) so agents can answer fuel-performance questions.
6. Exposes this data in the **Owner PWA and Admin dashboards**.
7. Performs analytics to **detect and predict changes in consumption patterns** over time.

---

## Repository Context (must align with existing code)
Use and extend these modules/tables instead of inventing parallel systems:

- Vehicle specs input/UI:
  - `src/pages/owner/OwnerVehicleProfile/components/VehicleSettingsPanel.tsx`
  - `src/pages/owner/OwnerVehicleProfile/components/VehicleSpecificationsForm.tsx` (primary focus for brand coverage and required vehicle metadata)
- Mileage/fuel display:
  - `src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx`
  - `src/hooks/useVehicleProfile.ts`
- Fuel computation ingest:
  - `supabase/functions/fetch-mileage-detail/index.ts`
  - `supabase/functions/sync-official-reports/index.ts`
- Vehicle-agent tools:
  - `supabase/functions/vehicle-chat/tools.ts` (`get_fuel_stats`, `update_vehicle_profile`)
- Relevant DB migrations:
  - `supabase/migrations/20260119000000_create_vehicle_specifications.sql`
  - `supabase/migrations/20260119000001_create_mileage_detail_table.sql`
  - `supabase/migrations/20260208120000_add_vehicle_profile_columns.sql`

Do not break existing telemetry units (GPS51 raw + converted fields).

---

## Functional Requirements

### 1) Vehicle Type + Manufacturer Baseline Model (2001–2016)
Add/normalize a canonical vehicle taxonomy:
- `bike`
- `tricycle`
- `car`
- `mini_van`
- `bus`

For each tracked vehicle, store:
- brand/make
- model
- year_of_manufacture (must validate 2001–2016 for this feature scope)
- fuel_type
- engine_size / displacement
- transmission
- baseline manufacturer fuel consumption (L/100km): city/highway/combined

If exact model baseline is missing, implement deterministic fallback order:
1. exact brand+model+year+engine+transmission
2. brand+model+year range
3. brand+vehicle_type+engine bucket
4. vehicle_type+engine bucket
5. global default by vehicle_type

Persist `baseline_source` and `confidence_score` so UI/agent can disclose estimate quality.


### Brand Coverage Requirement (Critical)
Rework brand handling in `src/pages/owner/OwnerVehicleProfile/components/VehicleSpecificationsForm.tsx` so **all vehicle brands are representable**:
- Do **not** rely on a short fixed brand array as the only source.
- Support a canonical brand catalog (seeded table or config) plus a searchable selector.
- Always provide an `Other / Custom brand` option so uncommon or regional brands can be entered manually.
- Store both `brand_display_name` and `brand_normalized_key` for dedupe/analytics consistency.
- Ensure this works for every supported vehicle type (bike, tricycle, car, mini van, bus).
- Add validation that prevents empty brand values but never blocks valid custom brands.


### 2) Vehicle Settings Inputs (required parameters)
In Vehicle Settings, ensure users can set/edit all parameters needed to generate the fuel model for all brands:
- vehicle_type (required)
- make/brand (required; sourced from full catalog + custom brand fallback)
- model (required)
- year_of_manufacture (required; 2001–2016 validation)
- fuel_type (required)
- engine_displacement_cc or liters (required for ICE/hybrid)
- transmission_type (required)
- fuel_tank_capacity_liters (optional but recommended)
- country/region driving profile (optional, for city/highway weighting)
- manual official rating override (`official_fuel_efficiency_l_100km`) with reason note

Define clear validation messages and prevent saving incomplete profiles when required fields are missing. Explicitly ensure the brand selector in `VehicleSpecificationsForm.tsx` can represent any global brand, including rare/local manufacturers.


### 2A) Owner Data Completion Prompts (must drive feature activation)
Add guided prompts so vehicle owners are actively asked to complete missing fuel-profile data before analytics are shown as “ready”.

Required behavior:
- If any required field is missing, show a persistent but user-friendly prompt banner in Vehicle Profile and Vehicle Settings.
- Add a “Complete Fuel Profile” CTA that deep-links to the correct section in `VehicleSpecificationsForm.tsx`.
- Show a progress indicator (e.g., `4/8 required fields completed`).
- Block “full analytics” mode when critical fields are missing; show which fields are missing and why they matter.
- Use agent nudges: when user asks fuel questions and profile is incomplete, the agent should request the missing fields first.
- Add reminder cadence (non-spammy): first trip after onboarding, then periodic reminders until completion.

Example owner-facing prompt copy (editable):
- “To calculate accurate fuel consumption per trip, please complete your Vehicle Fuel Profile.”
- “Missing: Vehicle type, brand, model, year, fuel type, engine size, transmission.”
- “Once completed, we’ll compare your actual trip usage against manufacturer baseline (L/100km and km/L).”

### 2B) Vehicle Profile Page — Key Details User Must Provide
Define these as canonical fuel-profile inputs on the Vehicle Profile/Settings page:

**Mandatory (feature-critical):**
1. `vehicle_type` (bike, tricycle, car, mini_van, bus)
2. `brand` (catalog or custom)
3. `model`
4. `year_of_manufacture` (must be 2001–2016 for this scope)
5. `fuel_type` (petrol, diesel, hybrid, electric where applicable)
6. `engine_displacement` (cc or liters; required for ICE/hybrid)
7. `transmission_type` (manual/automatic/CVT/etc.)
8. `official_fuel_efficiency_l_100km` OR enough details to derive baseline from manufacturer tables

**Recommended (improves accuracy):**
9. `fuel_tank_capacity_liters`
10. `driving_region_or_country`
11. `typical_use_pattern` (city/highway/mixed weighting)
12. `load_profile` (light/normal/heavy, optional)
13. `maintenance_state` or notes (optional but useful for anomaly interpretation)

Validation rules:
- Mandatory fields must be present before enabling manufacturer-vs-actual comparison.
- Allow custom brand/model values (do not force only predefined options).
- Explain each validation error in plain language and show exact next action.

### 3) Per-trip Fuel Consumption Computation
For each trip record, compute and store:
- `trip_consumption_actual_l_100km` (from telemetry where available)
- `trip_consumption_estimated_l_100km` (manufacturer + degradation + trip conditions)
- derived `trip_efficiency_km_per_l` = `100 / l_100km`
- `trip_consumption_variance_pct` vs manufacturer baseline

Keep compatibility with existing fields in `vehicle_mileage_details` and avoid regressing `oilper100km`, `runoilper100km`, `estimated_fuel_consumption_combined`, `fuel_consumption_variance`.

### 4) Degradation + Context Adjustments
Retain current degradation logic but make it explicit and configurable:
- base degradation per year (default 2%)
- optional modifiers by vehicle_type and fuel_type
- optional modifiers for heavy load/idling/traffic proxies if data exists

Store the exact formula inputs used per computation for auditability.

### 5) Agent Integration (Vehicle Chat)
Upgrade agent tools so fuel answers are grounded in both profile and trip data:
- Extend `get_fuel_stats` to return:
  - vehicle_type
  - manufacturer baseline details + source/confidence
  - trip-level consumption summaries
  - trend signal (improving/stable/worsening)
  - detected change points with date ranges
- Extend `update_vehicle_profile` to support vehicle_type and validation for 2001–2016 scope.
- Ensure agent response policy explains whether numbers are measured, inferred, or fallback estimates.

### 6) UI Surfaces (PWA + Admin)
Display fuel metrics across:
- Owner vehicle profile mileage section
- Fleet/Insights pages where applicable
- Admin dashboards (summary cards + drill-down)

Minimum visuals:
- avg actual L/100km
- avg estimated L/100km
- km/L equivalent
- variance %
- trend over time
- change-point alerts (e.g., “consumption worsened starting Week 32”)

### 7) Pattern-Change Analytics / Prediction
Implement analytics that compare travel behavior to fuel outcomes and detect significant shifts.
At minimum:
- rolling baseline windows (e.g., 7/30 day)
- z-score or robust threshold detection on L/100km residuals
- change-point flagging when sustained variance exceeds threshold
- short-horizon forecast of expected consumption and alert if predicted drift worsens

Persist analytics outputs in queryable storage for dashboard and agent use.

---

## Data Model / Migration Tasks
Create migrations as needed (without breaking existing tables):
- Add `vehicle_type`, `baseline_source`, `confidence_score`, and required normalization fields to `vehicle_specifications` and/or `vehicles`.
- Add trip-level fuel metric columns if absent in trip/mileage tables.
- Add analytics table for change-point/trend events (e.g., `fuel_consumption_analytics_events`).
- Add indexes for `(device_id, date)` and trend query performance.

Backfill strategy:
- Populate vehicle_type from existing `vehicles.device_type` where possible.
- Map legacy make/model/year fields into canonical spec records.
- Preserve null-safe behavior for vehicles lacking complete history.

---

## API / Edge Function Updates
- Update `fetch-mileage-detail` to consume canonical vehicle specs, compute enhanced metrics, and store provenance metadata.
- Ensure idempotent upserts and backward-compatible output contracts.
- Add/extend an analytics function (scheduled or event-driven) to recompute trend/change-point insights.

---

## Acceptance Criteria
1. User can save a valid vehicle profile for bike/tricycle/car/mini_van/bus with year 2001–2016, and incomplete profiles trigger guided completion prompts.
2. Trip-level fuel consumption metrics are generated and visible for supported trips.
3. Agent can explain actual vs estimated consumption and cite baseline source/confidence.
4. Owner PWA and Admin views display consumption and trend/change-point analytics, with clear “profile incomplete” states when required data is missing.
5. Alerts trigger when sustained pattern changes are detected.
6. Existing mileage pages and chat functionality remain backward compatible.

---

## Implementation Guardrails
- Keep TypeScript strictness; avoid `any` where possible.
- Reuse existing hooks/components/functions before creating duplicates.
- Preserve existing units and clearly label conversions between L/100km and km/L.
- Add tests for:
  - validation (vehicle_type/year range)
  - baseline fallback resolution
  - per-trip consumption calculations
  - trend/change-point detection
  - chat tool responses

---

## Deliverables
1. Migrations + updated schema.
2. Updated Vehicle Settings UX and validation.
3. Updated fuel computation pipeline.
4. Agent tool enhancements.
5. PWA/Admin dashboards/sections showing metrics and trend analytics.
6. Tests and concise technical notes in PR summary.
