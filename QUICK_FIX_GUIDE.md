# Quick Fix Guide - Production Readiness
**Time**: 45-60 minutes | **Difficulty**: Easy

---

## 🚀 Quick Start (Copy-Paste Ready)

### Step 1: Fix Database Indexes (15 min)

**Run these 4 statements ONE AT A TIME** in Supabase SQL Editor:

```sql
-- 1. Chat History (Small - Safe)
CREATE INDEX IF NOT EXISTS idx_vehicle_chat_history_device_user_created
  ON vehicle_chat_history(device_id, user_id, created_at DESC);
```

```sql
-- 2. Proactive Events (Small - Safe)
CREATE INDEX IF NOT EXISTS idx_proactive_vehicle_events_notified_device_created
  ON proactive_vehicle_events(notified, device_id, created_at DESC);
```

```sql
-- 3. Position History (Large - May take 1-2 min)
CREATE INDEX IF NOT EXISTS idx_position_history_device_recorded_recent
  ON position_history(device_id, recorded_at DESC)
  WHERE recorded_at >= '2026-01-15';
```

```sql
-- 4. Vehicle Trips (Large - May take 1-2 min)
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_start_time_recent
  ON vehicle_trips(device_id, start_time DESC)
  WHERE start_time >= '2026-01-15';
```

**If timeout**: Use more recent date like `'2026-01-25'`

---

### Step 2: Verify Edge Functions (10 min)

**Check**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions

**Required Functions**:
- ✅ `gps-data` (CRITICAL)
- ✅ `vehicle-chat`
- ✅ `execute-vehicle-command`
- ✅ `gps51-user-auth`
- ✅ `proactive-alarm-to-chat`

**If missing**: Deploy via Dashboard or CLI:
```bash
supabase functions deploy [function-name]
```

---

### Step 3: Verify Database (5 min)

**Run this verification**:

```sql
-- Check functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('get_daily_travel_stats', 'get_trip_patterns', 'calculate_battery_drain');

-- Check alert_dismissals table
SELECT COUNT(*) FROM alert_dismissals;

-- Check indexes (should return 2-4 rows)
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname IN (
  'idx_vehicle_chat_history_device_user_created',
  'idx_proactive_vehicle_events_notified_device_created',
  'idx_position_history_device_recorded_recent',
  'idx_vehicle_trips_device_start_time_recent'
);
```

---

### Step 4: Smoke Tests (15 min)

1. ✅ **Login** - Test user authentication
2. ✅ **Fleet Page** - Verify vehicles appear
3. ✅ **Chat** - Send message, verify AI responds
4. ✅ **RLS** - Login as user, verify only sees assigned vehicles

---

## ✅ Success Checklist

- [ ] At least 2 indexes created (chat + events)
- [ ] All critical edge functions deployed
- [ ] All 3 database functions exist
- [ ] Alert dismissals table exists
- [ ] Smoke tests pass

---

## 🆘 Quick Troubleshooting

**Index timeout?** → Use more recent date (`'2026-01-25'`)

**Function missing?** → Deploy via Dashboard or `supabase functions deploy [name]`

**Functions missing?** → Re-run `RUN_ALL_MIGRATIONS.sql` Migrations 1 & 4

---

**Full details**: See `PRODUCTION_FIX_PLAN.md`
