# Quick Start: ACH309EA Diagnostics

## 🚀 Run These 3 Queries First

Copy and paste into **Supabase SQL Editor** → Click **Run**

### 1️⃣ Is the vehicle registered?
```sql
SELECT * FROM vehicles WHERE device_id = 'ACH309EA';
```
- **0 rows** = Vehicle not registered ❌
- **1 row** = Vehicle exists ✅

---

### 2️⃣ Does GPS data exist?
```sql
SELECT
  count(*) as points,
  max(gps_time) as last_seen
FROM position_history
WHERE device_id = 'ACH309EA';
```
- **points = 0** = No GPS data ❌
- **points > 100** = GPS data flowing ✅

---

### 3️⃣ Are trips calculated?
```sql
SELECT
  count(*) as trips,
  sum(distance_km) as total_km
FROM vehicle_trips
WHERE device_id = 'ACH309EA';
```
- **trips = 0** = Trip calculation not working ❌
- **trips > 0** = Trips calculated ✅

---

## 🎯 Quick Diagnosis

| Query 1 | Query 2 | Query 3 | **Root Cause** | **Fix** |
|---------|---------|---------|----------------|---------|
| ❌ 0 rows | - | - | Vehicle not synced from GPS51 | Run `gps-data` sync |
| ✅ 1 row | ❌ 0 points | - | GPS data not syncing | Check GPS51 API connection |
| ✅ 1 row | ✅ Has data | ❌ 0 trips | Trip detection failing | Check trip calculation logic |
| ✅ 1 row | ✅ Has data | ✅ Has trips | Frontend/RLS issue | Check Query 4 below |

---

## 🔍 If All 3 Pass, Check User Access

### 4️⃣ Can user access this vehicle?
```sql
SELECT va.*, p.user_id
FROM vehicle_assignments va
JOIN profiles p ON p.id = va.profile_id
WHERE va.device_id = 'ACH309EA'
  AND p.user_id = auth.uid();
```
- **0 rows** = User has no assignment ❌ → Create assignment
- **1 row** = User has access ✅ → Check RPC functions

---

## 📋 Report Your Findings

After running the queries, report:

```
Query 1: [ ] PASS (1 row) / [ ] FAIL (0 rows)
Query 2: [ ] PASS (_____ points) / [ ] FAIL (0 points)
Query 3: [ ] PASS (_____ trips) / [ ] FAIL (0 trips)
Query 4: [ ] PASS (has assignment) / [ ] FAIL (no assignment)
```

---

## 📚 Full Diagnostic Guide

See **ACH309EA_DIAGNOSTIC_GUIDE.md** for:
- All 8 diagnostic queries
- Detailed explanations
- Common fixes
- Troubleshooting decision tree

---

## ⚡ Quick Fixes

### Fix: Vehicle Not Registered
```sql
INSERT INTO vehicles (device_id, device_name)
VALUES ('ACH309EA', 'ACH309EA');
```

### Fix: Create User Assignment
```sql
-- Replace 'your-user-id' with actual UUID
INSERT INTO vehicle_assignments (profile_id, device_id, role)
SELECT p.id, 'ACH309EA', 'owner'
FROM profiles p
WHERE p.user_id = 'your-user-id';
```

---

**Ready? Open Supabase SQL Editor and run Query 1! 🚀**
