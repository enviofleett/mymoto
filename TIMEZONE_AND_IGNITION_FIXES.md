# Timezone Display & Ignition Detection Fixes

## Issue 1: Timezone Showing Chinese

**Problem:** Timestamps are stored in UTC (`+00`) but may be displaying in Chinese timezone in the UI.

**Root Cause:** 
- Database stores timestamps in UTC (correct)
- Frontend may be using browser's default timezone or hardcoded timezone
- Some components use `toLocaleString()` without specifying timezone

**Current Code:**
- `ReportsSection.tsx` line 555: Uses `toLocaleString('en-US', ...)` but doesn't specify timezone
- Some components may be using default browser timezone

**Fix:** Ensure all date displays use consistent timezone (Africa/Lagos or UTC)

---

## Issue 2: Ignition Detection Not Working

**Problem Analysis:**
Looking at your data:
- Many vehicles have `ignition_on: true` with `speed: 0` (idling)
- Some vehicles have `ignition_on: true` with `speed > 0` (moving)
- **But no recent `ignition_on` events being created**

**Root Cause:**
The `detect_vehicle_events()` trigger only fires on `position_history` INSERT, but:
1. If vehicles were already running before migration, no state change is detected
2. The trigger compares `prev_position.ignition_on` with `NEW.ignition_on`
3. If both are `true`, no event is created (correct behavior)
4. **BUT:** We need to also detect when `vehicle_positions` table is updated

**Current Trigger Setup:**
- ✅ `detect_events_on_position_update` - Fires on `position_history` INSERT
- ❌ **Missing:** Trigger on `vehicle_positions` UPDATE for ignition state changes

---

## 🔧 Recommended Fixes

### Fix 1: Timezone Display

**File:** `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx`

```typescript
// Line 555 - Update to use Africa/Lagos timezone
{new Date(event.created_at).toLocaleString('en-US', {
  timeZone: 'Africa/Lagos',  // ADD THIS
  dateStyle: 'medium',
  timeStyle: 'short'
})}
```

**Or use UTC consistently:**
```typescript
{new Date(event.created_at).toISOString()}
// Or format manually with UTC
```

---

### Fix 2: Add Ignition Detection on vehicle_positions Updates

**Problem:** 
- `detect_vehicle_events()` only fires on `position_history` INSERT
- If `vehicle_positions` is updated directly (by gps-data function), ignition changes aren't detected
- Need trigger on `vehicle_positions` UPDATE

**Solution:** Create migration to add trigger on `vehicle_positions` updates

---

## 📋 Action Items

1. **Fix timezone display** - Update date formatting to use Africa/Lagos or UTC consistently
2. **Add vehicle_positions trigger** - Detect ignition changes when vehicle_positions is updated
3. **Test ignition detection** - Verify events are created when vehicles start/stop

---

## 🔍 Investigation Queries

### Check if vehicle_positions updates trigger events

```sql
-- Check if vehicle_positions has update triggers
SELECT 
  tgname,
  tgrelid::regclass AS table_name,
  tgenabled,
  CASE tgtype & 66
    WHEN 2 THEN 'BEFORE'
    WHEN 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS timing,
  CASE tgtype & 28
    WHEN 16 THEN 'UPDATE'
    WHEN 8 THEN 'DELETE'
    WHEN 4 THEN 'INSERT'
    WHEN 20 THEN 'INSERT OR UPDATE'
    WHEN 12 THEN 'UPDATE OR DELETE'
    ELSE 'UNKNOWN'
  END AS event
FROM pg_trigger
WHERE tgrelid = 'vehicle_positions'::regclass
  AND tgname LIKE '%ignition%' OR tgname LIKE '%detect%';
```

### Check recent ignition state changes

```sql
-- See if vehicles are changing ignition state
SELECT 
  device_id,
  ignition_on,
  LAG(ignition_on) OVER (PARTITION BY device_id ORDER BY gps_time) AS prev_ignition,
  gps_time
FROM vehicle_positions
WHERE gps_time > NOW() - INTERVAL '1 hour'
ORDER BY gps_time DESC
LIMIT 50;
```

---

## 🎯 Next Steps

1. **Review timezone handling** in all date display components
2. **Create migration** to add ignition detection on vehicle_positions updates
3. **Test** ignition event creation
