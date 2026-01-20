# Production Fix Plan
**Goal**: Resolve all blockers and get system ready for live production
**Estimated Time**: 45-60 minutes
**Risk Level**: Low (all changes are additive/safe)

---

## 🎯 Overview

This plan addresses 2 critical blockers preventing production deployment:
1. **Database Index Migrations** - Fixes failing index creation
2. **Edge Functions Verification** - Ensures all critical functions are deployed

---

## 📋 Phase 1: Fix Database Index Migrations (15-20 minutes)

### Step 1.1: Prepare Corrected Index Statements

**Action**: Copy these 4 SQL statements. You'll run them **ONE AT A TIME** in Supabase SQL Editor.

```sql
-- ============================================================================
-- INDEX 1: Chat History (Small table - Safe to run)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_vehicle_chat_history_device_user_created
  ON vehicle_chat_history(device_id, user_id, created_at DESC);

-- Wait for this to complete before running next statement
```

```sql
-- ============================================================================
-- INDEX 2: Proactive Events (Small table - Safe to run)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_proactive_vehicle_events_notified_device_created
  ON proactive_vehicle_events(notified, device_id, created_at DESC);

-- Wait for this to complete before running next statement
```

```sql
-- ============================================================================
-- INDEX 3: Position History (LARGE table - May take 1-2 minutes)
-- ============================================================================
-- Using hard-coded date to avoid NOW() predicate error
CREATE INDEX IF NOT EXISTS idx_position_history_device_recorded_recent
  ON position_history(device_id, recorded_at DESC)
  WHERE recorded_at >= '2026-01-15';

-- If this times out, try with more recent date: '2026-01-20'
-- Wait for this to complete before running next statement
```

```sql
-- ============================================================================
-- INDEX 4: Vehicle Trips (LARGE table - May take 1-2 minutes)
-- ============================================================================
-- Using hard-coded date to avoid NOW() predicate error
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_start_time_recent
  ON vehicle_trips(device_id, start_time DESC)
  WHERE start_time >= '2026-01-15';

-- If this times out, try with more recent date: '2026-01-20'
```

### Step 1.2: Execute Index Creation

**Location**: Supabase Dashboard → SQL Editor
**Method**: Run each statement individually, wait for completion

**Execution Order**:
1. ✅ Run Index 1 (Chat History) → Wait for success
2. ✅ Run Index 2 (Proactive Events) → Wait for success
3. ✅ Run Index 3 (Position History) → Wait for success (may take 1-2 min)
4. ✅ Run Index 4 (Vehicle Trips) → Wait for success (may take 1-2 min)

**If Timeout Occurs**:
- For Index 3 or 4: Use a more recent date (e.g., `'2026-01-20'` or `'2026-01-25'`)
- This creates a smaller index covering recent data only
- You can create full indexes later during low-traffic window

### Step 1.3: Verify Index Creation

**Run this verification query**:

```sql
-- Check all indexes exist
SELECT 
  indexname,
  tablename,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname IN (
  'idx_vehicle_chat_history_device_user_created',
  'idx_proactive_vehicle_events_notified_device_created',
  'idx_position_history_device_recorded_recent',
  'idx_vehicle_trips_device_start_time_recent'
)
ORDER BY indexname;
```

**Expected Result**: 4 rows returned (one for each index)

**If Missing Indexes**:
- Check error messages in Supabase SQL Editor
- Retry with more recent date if timeout occurred
- Indexes are optional for launch (performance optimization), but recommended

---

## 📋 Phase 2: Verify Edge Functions Deployment (10-15 minutes)

### Step 2.1: Check Current Deployment Status

**Location**: Supabase Dashboard → Edge Functions
**URL**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions

**Action**: 
1. Navigate to Edge Functions page
2. Note which functions are listed (deployed)
3. Compare with required list below

### Step 2.2: Required Critical Functions

**Must Be Deployed** (Critical for production):

| Function Name | Purpose | Priority |
|--------------|---------|----------|
| `gps-data` | Sync vehicles/GPS from GPS51 | 🚨 CRITICAL |
| `vehicle-chat` | AI chat with vehicles | 🔴 HIGH |
| `execute-vehicle-command` | Send commands to vehicles | 🔴 HIGH |
| `gps51-user-auth` | User authentication | 🔴 HIGH |
| `proactive-alarm-to-chat` | Proactive alerts to chat | 🟡 MEDIUM |

### Step 2.3: Deploy Missing Functions

**If functions are missing**, deploy them using one of these methods:

#### Option A: Supabase Dashboard (Easiest)
1. Click **"Deploy a new function"** or **"Create Function"**
2. Enter function name (e.g., `gps-data`)
3. Copy code from: `supabase/functions/[function-name]/index.ts`
4. Paste into editor
5. Click **"Deploy"**

#### Option B: Supabase CLI (Recommended for CI/CD)
```bash
# Navigate to project root
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Deploy each missing function
supabase functions deploy gps-data
supabase functions deploy vehicle-chat
supabase functions deploy execute-vehicle-command
supabase functions deploy gps51-user-auth
supabase functions deploy proactive-alarm-to-chat
```

**Note**: If using CLI, ensure you're logged in:
```bash
supabase login
supabase link --project-ref cmvpnsqiefbsqkwnraka
```

### Step 2.4: Verify Function Deployment

**After deploying**, verify each function:
1. Check function appears in Supabase Dashboard
2. Test function (optional but recommended):

```bash
# Test gps-data function
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

**Expected**: Function executes without errors (check logs in Dashboard)

---

## 📋 Phase 3: Verify Database Functions (5 minutes)

### Step 3.1: Check Required Functions Exist

**Run this verification query**:

```sql
-- Check all required database functions exist
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
  'get_daily_travel_stats',
  'get_trip_patterns',
  'calculate_battery_drain'
)
ORDER BY routine_name;
```

**Expected Result**: 3 rows returned

**If Missing Functions**:
- Re-run `RUN_ALL_MIGRATIONS.sql` (Migrations 1 and 4)
- Functions should already exist if migrations were run

### Step 3.2: Test Function Execution (Optional)

**Test each function**:

```sql
-- Test get_daily_travel_stats (replace with real device_id)
SELECT * FROM get_daily_travel_stats('YOUR_DEVICE_ID', '2026-01-01', '2026-01-20');

-- Test get_trip_patterns (replace with real device_id)
SELECT * FROM get_trip_patterns('YOUR_DEVICE_ID', 1, 8);

-- Test calculate_battery_drain (replace with real device_id)
SELECT * FROM calculate_battery_drain('YOUR_DEVICE_ID', 7);
```

**Expected**: Functions return results (or empty if no data)

---

## 📋 Phase 4: Verify Alert Dismissals Table (2 minutes)

### Step 4.1: Check Table Exists

**Run this query**:

```sql
-- Verify alert_dismissals table exists and has correct structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'alert_dismissals'
ORDER BY ordinal_position;
```

**Expected Result**: 6 columns:
- `id` (uuid)
- `device_id` (text)
- `user_id` (uuid)
- `alert_type` (text)
- `dismissed_at` (timestamptz)
- `created_at` (timestamptz)
- `dismissed_hour_epoch` (bigint) - Generated column

### Step 4.2: Check Indexes Exist

```sql
-- Verify indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename = 'alert_dismissals';
```

**Expected Result**: 3 indexes:
- `idx_alert_dismissals_hourly_unique`
- `idx_alert_dismissals_device_user_type_dismissed`
- `idx_alert_dismissals_user_type_count`

---

## 📋 Phase 5: Smoke Tests (15 minutes)

### Step 5.1: Test User Authentication

**Action**:
1. Open application in browser
2. Attempt to login with test user credentials
3. Verify login succeeds
4. Verify user sees dashboard

**Expected**: Login works, user redirected to dashboard

### Step 5.2: Test Vehicle Sync

**Action**:
1. Login as admin
2. Navigate to Fleet page
3. Verify vehicles are displayed
4. If no vehicles, manually trigger `gps-data` function

**Expected**: Vehicles appear in fleet list

### Step 5.3: Test AI Chat

**Action**:
1. Navigate to a vehicle's chat page
2. Send a test message (e.g., "Where am I?")
3. Verify AI responds
4. Check for errors in browser console

**Expected**: AI responds with relevant information

### Step 5.4: Test RLS Security

**Action**:
1. Login as regular user (not admin)
2. Navigate to Fleet/Alarms page
3. Verify user only sees vehicles assigned to them
4. Verify user cannot see other users' vehicles

**Expected**: User only sees assigned vehicles (security working)

### Step 5.5: Test Vehicle Commands (Optional)

**Action**:
1. Navigate to vehicle chat
2. Send command: "request status"
3. Verify command executes
4. Check for response

**Expected**: Command executes and returns status

---

## 📋 Phase 6: Final Verification Checklist

### Run Complete Verification

**Copy and run this complete verification script**:

```sql
-- ============================================================================
-- COMPLETE PRODUCTION VERIFICATION
-- ============================================================================

-- 1. Check Database Functions
SELECT 'Database Functions' as check_type, COUNT(*) as count
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('get_daily_travel_stats', 'get_trip_patterns', 'calculate_battery_drain')
HAVING COUNT(*) = 3;

-- 2. Check Alert Dismissals Table
SELECT 'Alert Dismissals Table' as check_type, COUNT(*) as count
FROM information_schema.tables
WHERE table_schema = 'public' 
AND table_name = 'alert_dismissals'
HAVING COUNT(*) = 1;

-- 3. Check Performance Indexes
SELECT 'Performance Indexes' as check_type, COUNT(*) as count
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname IN (
  'idx_vehicle_chat_history_device_user_created',
  'idx_proactive_vehicle_events_notified_device_created',
  'idx_position_history_device_recorded_recent',
  'idx_vehicle_trips_device_start_time_recent'
)
HAVING COUNT(*) >= 2;  -- At least 2 should exist (small tables)

-- 4. Check Alert Dismissals Indexes
SELECT 'Alert Dismissals Indexes' as check_type, COUNT(*) as count
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename = 'alert_dismissals'
HAVING COUNT(*) = 3;
```

**Expected Results**: All 4 checks should return 1 row each (all passing)

---

## 🚨 Troubleshooting

### Issue: Index Creation Times Out

**Solution**:
1. Use more recent date (e.g., `'2026-01-25'` instead of `'2026-01-15'`)
2. Creates smaller index covering recent data only
3. Full indexes can be created later during low-traffic window

### Issue: Edge Function Deployment Fails

**Solution**:
1. Check function code for syntax errors
2. Verify environment variables are set
3. Check Supabase logs for specific error messages
4. Try deploying via Dashboard instead of CLI

### Issue: Database Functions Missing

**Solution**:
1. Re-run `RUN_ALL_MIGRATIONS.sql` (Migrations 1 and 4)
2. Check for errors in SQL Editor
3. Functions should create successfully

### Issue: RLS Not Working

**Solution**:
1. Verify user has correct role in `user_roles` table
2. Check vehicle assignments in `user_vehicle_assignments` table
3. Test with admin user to verify admin policies work

---

## ✅ Success Criteria

**System is ready for production when**:

- [x] At least 2 performance indexes created (chat history + proactive events)
- [x] All critical edge functions deployed (`gps-data`, `vehicle-chat`, `execute-vehicle-command`)
- [x] All database functions exist (get_daily_travel_stats, get_trip_patterns, calculate_battery_drain)
- [x] Alert dismissals table exists with all indexes
- [x] Smoke tests pass (login, vehicle sync, chat, RLS)
- [x] No critical errors in browser console or Supabase logs

---

## 📊 Timeline

| Phase | Task | Time | Status |
|-------|------|------|--------|
| 1 | Fix Database Indexes | 15-20 min | ⏳ Pending |
| 2 | Verify Edge Functions | 10-15 min | ⏳ Pending |
| 3 | Verify Database Functions | 5 min | ⏳ Pending |
| 4 | Verify Alert Dismissals | 2 min | ⏳ Pending |
| 5 | Smoke Tests | 15 min | ⏳ Pending |
| 6 | Final Verification | 5 min | ⏳ Pending |
| **Total** | **All Phases** | **45-60 min** | **⏳ Pending** |

---

## 🎯 Next Steps After Fixes

1. **Monitor**: Watch Supabase logs for first 24 hours
2. **Performance**: Monitor database query performance
3. **Errors**: Check for any timeout or error messages
4. **Realtime**: Verify realtime subscriptions working correctly
5. **User Feedback**: Collect feedback from initial users

---

## 📝 Notes

- **Indexes are optional** for launch (performance optimization)
- **At minimum**, ensure chat history and proactive events indexes exist
- **Large table indexes** can be created later during low-traffic window
- **Edge functions** are critical - must be deployed before launch
- **Database functions** should already exist if migrations ran successfully

---

**Status**: ⏳ **Ready to Execute** - Follow phases 1-6 in order
