# Quick Checklist: Fix Missing Coordinates

## ✅ Pre-Flight Check (5 min)

- [ ] Got service role key from: Settings → API → service_role
- [ ] Opened `supabase/functions/sync-trips-incremental/index.ts`
- [ ] Opened `supabase/functions/reconcile-gps51-data/index.ts`

---

## 🚀 Deploy Functions (15 min)

### Function 1: sync-trips-incremental
- [ ] Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
- [ ] Click `sync-trips-incremental` → Edit
- [ ] Replace ALL code with updated version
- [ ] Verify: Search for `- 15` (should be -15, not -5)
- [ ] Verify: Search for `30 * 24` (should be 30, not 3)
- [ ] Click Deploy
- [ ] Wait for "Deployed successfully"

### Function 2: reconcile-gps51-data
- [ ] Click "Create a new function"
- [ ] Name: `reconcile-gps51-data`
- [ ] Paste code from `reconcile-gps51-data/index.ts`
- [ ] Click Deploy
- [ ] Wait for "Deployed successfully"

---

## 🧪 Test (10 min)

### Test on One Device
- [ ] Open Terminal/Command Prompt
- [ ] Run this command (replace YOUR_SERVICE_ROLE_KEY):
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"deviceId": "13612330240", "mode": "coordinates", "startDate": "2026-01-06", "endDate": "2026-01-21"}'
```
- [ ] Got success response with `tripsFixed` > 0
- [ ] Verified in SQL: missing percent dropped

---

## 🔧 Fix All (30-60 min)

### Run Full Reconciliation
- [ ] Open Terminal
- [ ] Run this command (replace YOUR_SERVICE_ROLE_KEY):
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"mode": "coordinates", "startDate": "2026-01-06", "endDate": "2026-01-21"}'
```
- [ ] Wait for completion (30-60 min)
- [ ] Got success response

---

## ✅ Verify (5 min)

### Check Overall Status
- [ ] Open SQL Editor
- [ ] Run Query #4 from `VERIFY_GPS51_FIXES.sql`
- [ ] `missing_coords_percent` is **<10%** ✅
- [ ] `trips_missing_coords` is **<400** ✅

### Check Top Devices
- [ ] Run top 10 devices query
- [ ] Most devices show **<20%** missing ✅

---

## 🎯 Success!

**Before:** 76.44% missing (3,011 trips)  
**After:** <10% missing (<400 trips)  
**Status:** ✅ FIXED

---

## 📋 Files Reference

- **Full Guide:** `COMPLETE_FIX_STEPS.md` (detailed instructions)
- **SQL Queries:** `VERIFY_GPS51_FIXES.sql` (verification queries)
- **Quick Commands:** `QUICK_FIX_COMMANDS.sh` (ready-to-use commands)
