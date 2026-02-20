# User Registration & Vehicle Onboarding: Recommended Logic (Aligned to Current Code)

## Current architecture (what exists today)

### 1) Two entry points are already present
- **Email/password auth** on `/auth` with Supabase sign-up + email confirmation flow.
- **GPS51 login auth** on `/login` that validates GPS credentials via edge function and auto-syncs vehicles.

### 2) Baseline account provisioning is trigger-based in DB
On `auth.users` insert, the DB trigger chain provisions:
- profile row,
- default role,
- wallet row.

### 3) Vehicle visibility is assignment-driven
Owner app data loading relies on `vehicle_assignments` joined to `profiles.user_id`, not only a single profile id shape.

### 4) Manual vehicle onboarding exists as a request workflow
- Owner can submit vehicle details (`vehicle_onboarding_requests`) with optional IMEI.
- Admin approves/rejects through `admin-process-vehicle-onboarding-request` edge function.
- On approval: validates device exists, creates assignment, updates `vehicles.primary_owner_profile_id`, marks request approved.

## Best-practice flow to use going forward

## A. Preferred onboarding path (fast path): GPS51 login first
Use `/login` as the primary CTA for owners who already have a tracker account.

Recommended sequence:
1. User logs in with GPS51 credentials.
2. Edge function validates credentials against GPS51.
3. Create/update Supabase auth user + profile.
4. Sync devices from GPS51 into `vehicles`.
5. Upsert owner assignments in `vehicle_assignments`.
6. Sign user in and route to `/owner/vehicles`.

Why this is best for current codebase:
- It aligns with dashboard empty-state CTA (“Connect with GPS51 Login”).
- It avoids manual admin bottlenecks when owner already controls GPS account.
- It immediately satisfies `useOwnerVehicles` assignment-based fetch model.

## B. Fallback path: manual request workflow
If user cannot connect GPS51 directly (e.g., installer controls account), keep manual request as fallback:
1. User signs up via `/auth` (email/password).
2. User opens “Request Vehicle Manually”.
3. Request row is created with status `pending` and optional `requested_device_id`.
4. Admin reviews request, provides/overrides `device_id`, approves.
5. System links owner to vehicle (`vehicle_assignments`) and sets primary owner.
6. Owner receives approval email + sees vehicle in dashboard.

## C. Unified UX policy
- Keep **both** entry points, but in this order of prominence:
  1) Connect with GPS51 Login (primary)
  2) Request Vehicle Manually (secondary)
- For `/auth` sign-up success, guide directly to “Connect GPS51” step after email verification.

## D. State model to standardize

### User/account states
- `unverified_user` (signed up, email unconfirmed)
- `verified_no_vehicle`
- `vehicle_request_pending`
- `active_owner` (>=1 assignment)

### Request states
Already present and good:
- `pending`
- `approved` (must include `approved_device_id`)
- `rejected`

## E. Data/ownership policy

For ownership consistency, use:
- `vehicle_assignments` for **access**.
- `vehicles.primary_owner_profile_id` for **control authority**.

Policy recommendation:
- On approval or GPS sync assignment, do not automatically overwrite existing `primary_owner_profile_id` unless policy allows takeover (explicit admin decision).
- Keep assignment idempotent (`onConflict: device_id,profile_id`).

## F. Operational controls and guardrails

1. **Approval preconditions** (already mostly implemented)
- Request must be `pending`.
- Device must exist in `vehicles` before approval.

2. **Input validation improvements**
- Enforce IMEI format (15-digit) when provided in request form.
- Normalize plate and VIN consistently.

3. **Observability**
- Keep analytics events for auth + vehicle request stages.
- Add explicit funnel events:
  - `owner_onboarding_started`
  - `owner_gps51_linked`
  - `owner_manual_request_submitted`
  - `owner_vehicle_approved`

4. **Email and in-app notices**
- Continue approval/rejection emails.
- Show pending badge in owner dashboard until assignment appears.

## G. Key code-level gaps to prioritize

1. **`gps51-user-auth` reliability cleanup**
- Remove duplicate `md5` function declaration.
- Fix undefined logging vars (`loginPayload`, `loginResponse`, `vehiclesPayload`, `vehiclesResponse`) used in inserts.
- Consider replacing `auth.admin.listUsers()` full scan with direct lookup strategy to scale.

2. **Primary owner assignment policy**
- Current GPS sync sets `primary_owner_profile_id` to admin profile during sync path; this can conflict with owner expectations. Define and enforce a single policy.

3. **Manual request validation**
- Form allows free text IMEI; add strict validation and user guidance before submit.

## Recommended canonical onboarding journey (final)

1. **New owner lands on app**
- See two options: Connect GPS51 (primary), Manual Request (secondary).

2. **If GPS51 succeeds**
- Auto-create/refresh account and assignments.
- Directly open owner dashboard with live vehicles.

3. **If GPS51 unavailable or no credentials**
- User signs up/verify email.
- Submits manual request.
- Admin approves and links actual device.
- Owner receives notification and gains access.

This gives fastest time-to-value while preserving controlled onboarding when direct GPS linkage is not possible.
