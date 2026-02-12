# MyMoto PWA - End-to-End Production Verification Prompt

> **Purpose:** This prompt is designed for Trae AI to perform a comprehensive end-to-end simulated verification of the entire MyMoto PWA system before going LIVE. Every critical path, data flow, edge function, database query, real-time subscription, and integration point must be validated.

---

## INSTRUCTIONS FOR TRAE AI

You are a senior QA/DevOps engineer performing a final production readiness audit on the MyMoto PWA. You must verify every critical system path by reading the actual source code, tracing data flows end-to-end, and flagging any broken links, missing imports, schema mismatches, unhandled errors, or runtime failures that would prevent production operation.

**For each section below:**
1. Read the referenced source files
2. Trace the data flow from trigger to database to UI
3. Verify all imports resolve, all DB columns exist, all API contracts match
4. Flag any issue as BLOCKER (prevents LIVE), WARNING (degraded experience), or INFO (cosmetic)
5. Provide a PASS/FAIL verdict per section

---

## SECTION 1: AUTHENTICATION & AUTHORIZATION

### Test 1.1: Login Flow
- **Files:** `src/contexts/AuthContext.tsx`, `src/pages/auth/Login.tsx`, `src/pages/PwaLogin.tsx`
- **Verify:**
  - `supabase.auth.signInWithPassword()` is called correctly
  - Session token is stored and accessible via `useAuth()`
  - Role fetching from `user_roles` table works (check column names match)
  - `isAdmin` and `isProvider` flags derive correctly from roles
  - Error states (wrong password, network error) are handled with user-facing messages

### Test 1.2: Protected Routes
- **Files:** `src/App.tsx`, `src/components/ProtectedRoute.tsx`, `src/components/RoleBasedRedirect.tsx`
- **Verify:**
  - All `/owner/*` routes are wrapped in `ProtectedRoute`
  - All `/admin/*` routes check for admin role
  - Unauthenticated users are redirected to `/auth` or `/login`
  - `RoleBasedRedirect` routes admins to `/fleet` and owners to `/owner`
  - No route allows unauthenticated access to vehicle data

### Test 1.3: Auth Token Propagation to Edge Functions
- **Files:** `src/hooks/useTripSync.ts` (triggerTripSync function), `src/hooks/useVehicleProfile.ts`
- **Verify:**
  - Edge function invocations include `Authorization: Bearer ${session.access_token}`
  - Session refresh logic works when token expires
  - Service-role key is NEVER exposed in frontend code (grep for `SUPABASE_SERVICE_ROLE_KEY` in `src/`)

---

## SECTION 2: VEHICLE PROFILE PAGE (Owner PWA) - TRIP REPORTS

### Test 2.1: Data Loading Pipeline
- **Files:** `src/pages/owner/OwnerVehicleProfile/index.tsx`, `src/hooks/useVehicleProfile.ts`
- **Verify:**
  - `useVehicleTrips(deviceId, { dateRange, live: true, limit: 200 })` is called (NOT limit: 50)
  - `useVehicleEvents(deviceId, { dateRange, limit: 50 })` is called
  - `fetchVehicleTrips()` queries `vehicle_trips` table with correct column names
  - Ghost trip filtering thresholds match: `MIN_DISTANCE_KM: 0.5`, `MIN_DURATION_SEC: 180`, `MAX_SPEED_KMH: 200`
  - `end_time` null handling: verify trips with null `end_time` get a calculated value before reaching the UI
  - Date range filter uses `.gte('start_time', ...)` and `.lte('start_time', ...)`

### Test 2.2: Trip Sync Integration (RECENTLY FIXED)
- **Files:** `src/pages/owner/OwnerVehicleProfile/index.tsx`, `src/hooks/useTripSync.ts`
- **Verify:**
  - `useTripSyncStatus(deviceId)` is imported and called
  - `useTriggerTripSync()` is imported and called
  - `useRealtimeTripUpdates(deviceId)` is imported and called
  - `handleForceSync` callback calls `triggerSync.mutate({ deviceId, forceRecent: true })`
  - `ReportsSection` receives ALL these props: `syncStatus`, `isSyncing`, `onForceSync`, `isRealtimeActive`, `isAutoSyncing`
  - The Sync button renders (verify `onForceSync` is not undefined/null)
  - `triggerTripSync()` in useTripSync.ts gets a valid auth session before calling `sync-trips-incremental`

### Test 2.3: ReportsSection Component
- **Files:** `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx`
- **Verify:**
  - Trip grouping uses `formatLagos()` for timezone-correct date grouping (Africa/Lagos)
  - Trips within each day are sorted by `start_time ASC` (Trip 1 = earliest)
  - Days are sorted `DESC` (latest day first)
  - `TripCard` component renders: distance, duration, avg speed, max speed, start/end addresses
  - `useAddress()` hook is called for start and end coordinates
  - "No trips recorded" empty state renders when `groupedTrips.length === 0`
  - Tabs render: Trips, Alarms, Geofence, Notifications
  - `TripSyncProgress` component receives `deviceId` and `isSyncing` props

### Test 2.4: Trip Sync Edge Function
- **Files:** `supabase/functions/sync-trips-incremental/index.ts`
- **Verify:**
  - Function reads GPS51 credentials from environment variables
  - GPS51 API rate limiting is enforced (max 3 calls/second, 350ms between calls)
  - Ghost trip filtering before database insert matches frontend thresholds
  - Trips are inserted into `vehicle_trips` table with correct column names
  - Duplicate detection uses `(device_id, start_time, end_time)` unique index
  - `trip_sync_status` table is updated with progress (processing -> completed/error)
  - Error handling: IP rate limit (code 8902) triggers extended backoff

### Test 2.5: Realtime Trip Updates
- **Files:** `src/hooks/useTripSync.ts` (useRealtimeTripUpdates)
- **Verify:**
  - Subscribes to `vehicle_trips` table INSERT events filtered by `device_id`
  - New trips are added to React Query cache directly (not just invalidated)
  - Duplicate detection prevents same trip from appearing twice
  - `trip_sync_status` realtime subscription updates sync progress in real-time
  - Cleanup function unsubscribes both channels on unmount

---

## SECTION 3: VEHICLE CHAT AI AGENT

### Test 3.1: Chat Message Flow (End-to-End)
- **Files:** `src/pages/owner/OwnerChat.tsx` (or equivalent chat page), `supabase/functions/vehicle-chat/index.ts`
- **Verify:**
  - Frontend sends: `{ message, device_id, conversation_id, client_timestamp, user_timezone, user_id }`
  - Edge function authenticates user via `supabase.auth.getUser(token)`
  - Device name resolution works (non-numeric device_id → lookup in `vehicles` table)
  - `buildConversationContext()` is called with `(supabase, device_id, user_id)`
  - `extractDateContext()` receives `(message, client_timestamp, user_timezone)`

### Test 3.2: Conversation Context Injection (RECENTLY FIXED)
- **Files:** `supabase/functions/vehicle-chat/index.ts`, `supabase/functions/vehicle-chat/conversation-manager.ts`
- **Verify:**
  - `buildConversationContext()` returns `{ recent_messages, conversation_summary, important_facts, total_message_count }`
  - `conversation_summary` is appended to system prompt as `CONVERSATION HISTORY SUMMARY`
  - `important_facts` are appended to system prompt as `KEY FACTS FROM PAST CONVERSATIONS`
  - The `systemContent` variable includes BOTH `finalSystemPrompt` AND `contextPreamble`
  - Messages array is: `[{ role: 'system', content: systemContent }, ...recent_messages, { role: 'user', content: message }]`
  - This ensures the agent retains context beyond the 20-message sliding window

### Test 3.3: Date Context (RECENTLY FIXED)
- **Files:** `supabase/functions/vehicle-chat/index.ts`, `supabase/functions/vehicle-chat/date-extractor.ts`
- **Verify:**
  - System prompt includes BOTH `dateContext.startDate` AND `dateContext.endDate`
  - Format is: `Date Range: ${dateContext.startDate} to ${dateContext.endDate}`
  - Default timezone is `Africa/Lagos` (not UTC)
  - `extractDateContext()` correctly parses: "today", "yesterday", "last week", "this month", "3 days ago", specific dates like "Jan 15"

### Test 3.4: Tool Calling - get_trip_history (RECENTLY FIXED)
- **Files:** `supabase/functions/vehicle-chat/tools.ts`
- **Verify:**
  - Queries `vehicle_trips` table with `.gte('start_time', start_date).lte('end_time', end_date)`
  - `validateTrip()` marks ghost trips (`isGhost: true`) and filters them out
  - Reverse geocoding fallback: for first 10 trips, if `start_address` and `start_location_name` are both null, calls `reverseGeocode(lat, lng)`
  - Remaining trips (11+) use `|| 'Unknown location'` fallback
  - Response includes: `max_speed_kmh`, `avg_speed_kmh` (recently added)
  - `reverseGeocode` import from `../_shared/geocoding.ts` resolves correctly

### Test 3.5: Tool Calling - get_vehicle_status
- **Files:** `supabase/functions/vehicle-chat/tools.ts`
- **Verify:**
  - Queries `vehicle_positions` table with `.eq('device_id', device_id).limit(1).maybeSingle()`
  - Returns `status`, `location.address`, `location.map_link`, `telemetry` (speed, ignition, battery, odometer)
  - `reverseGeocode()` is called for live address resolution
  - Data freshness check: `timeAgoMinutes > 15` marks as 'stale'

### Test 3.6: Tool Calling - get_trip_analytics
- **Files:** `supabase/functions/vehicle-chat/tools.ts`
- **Verify:**
  - Queries both `vehicle_daily_stats` view AND `vehicle_trips` table
  - `vehicle_daily_stats` view error is caught and logged (non-blocking)
  - Period calculation is correct for: today, yesterday, this_week, last_week, this_month, custom
  - Parking time calculation only counts gaps < 12 hours
  - Response includes: total_trips, total_distance_km, total_drive_time, total_parking_time, daily_breakdown

### Test 3.7: Tool Calling - get_position_history
- **Files:** `supabase/functions/vehicle-chat/tools.ts`
- **Verify:**
  - Queries `position_history` table with time range filter
  - Limit capped at 500 positions max
  - Haversine distance calculation filters GPS jumps (> 10km between points)
  - Returns summary (distance, max/avg speed, ignition %) and position array

### Test 3.8: Tool Calling - get_favorite_locations
- **Files:** `supabase/functions/vehicle-chat/tools.ts`
- **Verify:**
  - Queries trip end points from `vehicle_trips` with `.not('end_latitude', 'is', null)`
  - Clusters nearby locations within 100m radius using Haversine
  - Sorts by visit count, returns top N
  - Reverse geocodes clusters without addresses

### Test 3.9: Chat History Persistence
- **Files:** `supabase/functions/vehicle-chat/index.ts`
- **Verify:**
  - User message inserted into `vehicle_chat_history` with `{ device_id, user_id, role: 'user', content }`
  - Assistant response inserted with `{ device_id, user_id, role: 'assistant', content }`
  - Both inserts use correct column names matching the table schema
  - Errors on insert are logged but don't crash the function

### Test 3.10: LLM Client
- **Files:** `supabase/functions/_shared/llm-client.ts`
- **Verify:**
  - `OPENROUTER_API_KEY` is read from `Deno.env`
  - `LLM_MODEL` is read from `Deno.env` or config
  - Retry logic: 3 retries with exponential backoff (500ms, 1s, 2s)
  - Auth errors (401, 403, 400) are NOT retried
  - Rate limit (429) IS retried
  - Response parsing handles `tool_calls` in addition to text

---

## SECTION 4: LIVE VEHICLE DATA & MAP

### Test 4.1: GPS Data Fetching
- **Files:** `src/hooks/useVehicleLiveData.ts`, `supabase/functions/gps-data/index.ts`
- **Verify:**
  - `fetchVehicleLiveDataDirect()` calls the `gps-data` edge function
  - Edge function authenticates with GPS51 API
  - Response maps GPS51 fields to `VehicleLiveData` interface (latitude, longitude, speed, heading, batteryPercent, ignitionOn, isOnline, totalMileageKm)
  - Polling interval: 15 seconds on vehicle profile page
  - Fallback: if live data fails, uses `vehicle_positions` table data

### Test 4.2: Map Rendering
- **Files:** `src/pages/owner/OwnerVehicleProfile/components/VehicleMapSection.tsx`
- **Verify:**
  - Mapbox GL JS is imported and initialized
  - Map displays vehicle marker at correct coordinates
  - Heading/rotation is applied to marker
  - Online/offline status affects marker appearance
  - Address overlay displays correctly
  - Map handles null coordinates gracefully (loading state)

### Test 4.3: Realtime Position Updates
- **Files:** `src/hooks/useRealtimeVehicleUpdates.ts`
- **Verify:**
  - Subscribes to `vehicle_positions` table changes for specific device
  - Updates React Query cache on position change
  - Reconnection logic with exponential backoff
  - Unsubscribe on component unmount

---

## SECTION 5: VEHICLE COMMANDS

### Test 5.1: Engine Control Flow
- **Files:** `src/pages/owner/OwnerVehicleProfile/components/EngineControlCard.tsx`, `src/hooks/useVehicleProfile.ts` (useVehicleCommand), `supabase/functions/execute-vehicle-command/index.ts`
- **Verify:**
  - Immobilize button sends `{ device_id, command_type: 'immobilize_engine' }`
  - Edge function validates user owns the vehicle
  - GPS51 API command mapping: immobilize_engine -> RELAY,1
  - Command is logged in `vehicle_commands` table
  - Success/failure toast appears on frontend
  - Confirmation dialog shows for dangerous commands

---

## SECTION 6: WALLET & PAYMENTS

### Test 6.1: Wallet Balance
- **Files:** `src/hooks/useWallet.ts`, database table `wallets`
- **Verify:**
  - `useWallet()` queries `wallets` table with user's profile_id
  - Balance displays correctly on `/owner/wallet`
  - Transaction history fetches from `wallet_transactions` with correct ordering

### Test 6.2: Paystack Integration
- **Files:** `supabase/functions/paystack/index.ts`
- **Verify:**
  - Payment initialization sends correct payload to Paystack API
  - Callback URL routes back to app
  - Verification endpoint confirms payment and credits wallet
  - `PAYSTACK_SECRET_KEY` is read from environment (not hardcoded)

---

## SECTION 7: NOTIFICATIONS & ALERTS

### Test 7.1: Push Notifications
- **Files:** `src/hooks/useNotifications.ts`, `public/sw-custom.js`
- **Verify:**
  - Service worker handles `push` events
  - Notification click routes to correct page (chat or notifications)
  - Badge API updates unread count
  - Vibration patterns vary by severity

### Test 7.2: Proactive Alerts
- **Files:** `supabase/functions/proactive-alarm-to-chat/index.ts`, `supabase/functions/send-alert-email/index.ts`
- **Verify:**
  - Vehicle alarms from GPS51 trigger proactive chat messages
  - Alert emails include vehicle name, location, and map link
  - `notification_preferences` table is checked before sending
  - Alert dispatch is logged in `alert_dispatch_log`

### Test 7.3: Geofence Monitoring
- **Files:** `src/components/fleet/GeofenceManager.tsx`, `supabase/functions/check-geofences/index.ts`
- **Verify:**
  - Geofence zones are created with correct lat/lng/radius
  - `check-geofences` function compares vehicle positions against zones
  - Entry/exit events are logged in `geofence_events` table
  - Notifications are sent on geofence violations

---

## SECTION 8: OWNER VEHICLE LIST & NAVIGATION

### Test 8.1: Vehicle List Loading
- **Files:** `src/hooks/useOwnerVehicles.ts`, `src/pages/owner/OwnerVehicleList.tsx`
- **Verify:**
  - Queries `vehicle_assignments` (or `vehicle_assignments_new`) joined with `vehicles` and `vehicle_positions`
  - Returns correct fields: deviceId, plateNumber, status, latitude, longitude, speed, battery
  - Vehicle cards navigate to `/owner/vehicle/${deviceId}`

### Test 8.2: Vehicle Chat Navigation
- **Files:** `src/pages/owner/OwnerChatHome.tsx`, routing config
- **Verify:**
  - `/owner` shows vehicle list for chat selection
  - Clicking vehicle navigates to `/owner/chat/${deviceId}`
  - Chat page loads vehicle persona settings from `vehicle_llm_settings`
  - Messages load from `vehicle_chat_history` filtered by device_id and user_id

---

## SECTION 9: DATABASE SCHEMA VALIDATION

### Test 9.1: Critical Table Schema Checks
- **Files:** All migrations in `supabase/migrations/`
- **Verify these tables exist with correct columns:**

| Table | Required Columns |
|---|---|
| `vehicle_trips` | id, device_id, start_time, end_time, start_latitude, start_longitude, end_latitude, end_longitude, distance_km, max_speed, avg_speed, duration_seconds, source, start_address, end_address, start_location_name, end_location_name |
| `vehicle_positions` | device_id, latitude, longitude, speed, heading, gps_time, is_online, ignition_on, battery_percent, total_mileage |
| `vehicle_chat_history` | id, device_id, user_id, role, content, created_at |
| `trip_sync_status` | id, device_id, last_sync_at, sync_status, trips_processed, trips_total, sync_progress_percent, current_operation, error_message, updated_at |
| `proactive_vehicle_events` | id, device_id, event_type, severity, title, message (or description), created_at, acknowledged, metadata |
| `vehicle_llm_settings` | device_id, nickname, language_preference, personality_mode, llm_enabled, avatar_url |
| `wallets` | id, profile_id, balance |
| `geofence_zones` | id, device_id, name, latitude, longitude, radius_meters, is_active |

### Test 9.2: RLS Policy Validation
- **Verify:**
  - `vehicle_trips` has SELECT policy checking `vehicle_assignments` join
  - `position_history` has SELECT policy for assigned vehicles
  - `vehicle_chat_history` filters by user_id
  - Service role can INSERT into all tables
  - No table with sensitive data is missing RLS

### Test 9.3: View Dependencies
- **Verify:**
  - `vehicle_daily_stats` view exists and references `vehicle_trips` TABLE (not a dropped view)
  - View uses `security_invoker = true`
  - View groups by `date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')`

---

## SECTION 10: ENVIRONMENT VARIABLES & SECRETS

### Test 10.1: Required Supabase Secrets
- **Verify these are documented and required:**
  - `SUPABASE_URL` - Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY` - Service role key for edge functions
  - `SUPABASE_ANON_KEY` - Anonymous key for frontend
  - `OPENROUTER_API_KEY` - LLM API key
  - `LLM_MODEL` - Model identifier (e.g., google/gemini-2.5-flash)
  - `MAPBOX_ACCESS_TOKEN` - Mapbox geocoding and maps
  - `PAYSTACK_SECRET_KEY` - Payment processing
  - GPS51 credentials (check what env vars the gps-data function reads)

### Test 10.2: Frontend Environment
- **Files:** `src/integrations/supabase/client.ts`
- **Verify:**
  - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used (not service role)
  - No secret keys in frontend bundle (grep `src/` for `SERVICE_ROLE`, `SECRET`, `OPENROUTER`)

---

## SECTION 11: PWA MANIFEST & SERVICE WORKER

### Test 11.1: Manifest
- **Files:** `public/manifest.json` (or `manifest.webmanifest`)
- **Verify:**
  - `name`, `short_name`, `start_url`, `display: standalone`
  - Icons: at least 192x192 and 512x512 (check files exist in `public/`)
  - `theme_color` and `background_color` are set
  - `scope` is correct

### Test 11.2: Service Worker
- **Files:** `public/sw-custom.js`, `vite.config.ts` (VitePWA plugin)
- **Verify:**
  - Push notification handling in service worker
  - Notification click opens correct URL
  - Cache strategies: Supabase = NetworkFirst, Mapbox = CacheFirst
  - Auto-update registration is enabled

---

## SECTION 12: ERROR HANDLING & EDGE CASES

### Test 12.1: Network Failure Handling
- **Verify:**
  - `useVehicleLiveData` has `retry: 2` configured
  - `useTripSync` retries with exponential backoff on GPS51 rate limit
  - Chat function has MAX_TURNS = 5 to prevent infinite tool-call loops
  - All edge functions return proper HTTP status codes (401, 500, etc.)

### Test 12.2: Empty State Handling
- **Verify:**
  - Vehicle profile shows "No trips recorded" when trips array is empty
  - Chat shows appropriate message when no history exists
  - Wallet shows zero balance gracefully
  - Vehicle list shows empty state when no vehicles assigned

### Test 12.3: Stuck Sync Detection
- **Files:** `src/hooks/useTripSync.ts`
- **Verify:**
  - Sync stuck for > 10 minutes is auto-detected and reset
  - Reset attempts RPC call `reset_stuck_sync_status`
  - Falls back to frontend-only reset if RPC doesn't exist

---

## FINAL VERDICT FORMAT

After completing all sections, provide:

```
=== PRODUCTION READINESS REPORT ===

SECTION 1: Authentication       [PASS/FAIL] - Details
SECTION 2: Trip Reports         [PASS/FAIL] - Details
SECTION 3: Chat AI Agent        [PASS/FAIL] - Details
SECTION 4: Live Data & Map      [PASS/FAIL] - Details
SECTION 5: Vehicle Commands     [PASS/FAIL] - Details
SECTION 6: Wallet & Payments    [PASS/FAIL] - Details
SECTION 7: Notifications        [PASS/FAIL] - Details
SECTION 8: Navigation           [PASS/FAIL] - Details
SECTION 9: Database Schema      [PASS/FAIL] - Details
SECTION 10: Environment Vars    [PASS/FAIL] - Details
SECTION 11: PWA Manifest/SW     [PASS/FAIL] - Details
SECTION 12: Error Handling      [PASS/FAIL] - Details

BLOCKERS: [list any BLOCKER issues]
WARNINGS: [list any WARNING issues]

OVERALL VERDICT: [GO / NO-GO] for LIVE production
```
