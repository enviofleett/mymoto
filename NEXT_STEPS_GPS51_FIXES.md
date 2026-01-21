# Next Steps: GPS51 Reconciliation Fixes

**Date:** 2026-01-21  
**Status:** Ready for Deployment

## ✅ What's Been Done

1. ✅ Fixed backfill window: ±5min → ±15min
2. ✅ Fixed first sync history: 3 days → 30 days  
3. ✅ Created reconciliation function
4. ✅ Added comprehensive documentation

## 🚀 Immediate Next Steps

### Step 1: Deploy Updated Functions (5 minutes)

**Option A: Via Supabase Dashboard (Easiest)**
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Find `sync-trips-incremental` function
3. Click "Edit" → Replace code with updated version from `supabase/functions/sync-trips-incremental/index.ts`
4. Click "Deploy"

**Option B: Via Supabase CLI (Terminal)**
```bash
# ⚠️ Run this in Terminal/Command Prompt, NOT SQL Editor!
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy sync-trips-incremental
```

### Step 2: Deploy New Reconciliation Function (5 minutes)

**Option A: Via Supabase Dashboard**
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click "Create a new function"
3. Name: `reconcile-gps51-data`
4. Copy code from: `supabase/functions/reconcile-gps51-data/index.ts`
5. Click "Deploy"

**Option B: Via Supabase CLI (Terminal)**
```bash
# ⚠️ Run this in Terminal/Command Prompt, NOT SQL Editor!
supabase functions deploy reconcile-gps51-data
```

### Step 3: Test the Fixes (10 minutes)

**⚠️ IMPORTANT:** 
- **SQL queries** → Run in Supabase SQL Editor
- **Bash/curl commands** → Run in Terminal/Command Prompt
- See `VERIFY_GPS51_FIXES.sql` for all SQL queries

**Test 1: Verify Backfill Window (SQL Editor)**
Open `VERIFY_GPS51_FIXES.sql` and run Query #1 - Coordinate Completeness

**Test 2: Verify First Sync History (SQL Editor)**
Open `VERIFY_GPS51_FIXES.sql` and run Query #2 - First Sync Coverage

**Test 3: Manual Sync Test (Terminal)**
```bash
# Run this in Terminal/Command Prompt (NOT SQL Editor!)
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "device_ids": ["YOUR_TEST_DEVICE_ID"],
    "force_full_sync": true
  }'
```

### Step 4: Run Reconciliation on Existing Data (30-60 minutes)

**⚠️ IMPORTANT:** These are Terminal/Command Prompt commands, NOT SQL!

**For Single Device (Test First) - Run in Terminal:**
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "deviceId": "YOUR_TEST_DEVICE_ID",
    "mode": "coordinates",
    "startDate": "2025-12-01",
    "endDate": "2026-01-21"
  }'
```

**For All Devices (Production Run) - Run in Terminal:**
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "full",
    "startDate": "2025-12-01",
    "endDate": "2026-01-21"
  }'
```

**⚠️ Note:** Full reconciliation for all devices may take 2-4 hours depending on fleet size.

### Step 5: Monitor Results (Ongoing)

**⚠️ IMPORTANT:** Run these SQL queries in Supabase SQL Editor (NOT Terminal!)

**Daily Monitoring Query (SQL Editor)**
Open `VERIFY_GPS51_FIXES.sql` and run Query #1 - Coordinate Completeness

**Weekly Health Check (SQL Editor)**
Open `VERIFY_GPS51_FIXES.sql` and run Query #4 - Overall Health Metrics

## 📊 Success Criteria

After deployment, you should see:

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Coordinate Completeness | 90-95% | Run daily monitoring query |
| First Sync Coverage | 30 days | Check earliest trip for new devices |
| Backfill Success Rate | 90%+ | Compare before/after reconciliation |
| Trip Distance Accuracy | 95-99% | Compare with GPS51 dashboard |

## 🔄 Ongoing Maintenance

1. **Weekly:** Run reconciliation function on any devices with low coordinate completeness
2. **Monthly:** Review trip distance accuracy vs GPS51
3. **Quarterly:** Full reconciliation run on all devices

## 🐛 Troubleshooting

**Issue: Reconciliation function not found**
- Solution: Make sure you deployed `reconcile-gps51-data` function

**Issue: Still seeing trips with (0,0) coordinates**
- Solution: Run reconciliation function for those specific devices
- Check if position_history has data for those time periods

**Issue: First sync still only getting 3 days**
- Solution: Verify the code change was deployed (check line 974 in deployed function)
- Force a full sync: `{"force_full_sync": true}`

**Issue: Backfill not finding coordinates**
- Solution: Check if position_history has data within ±15 minutes of trip times
- May need to run `gps-history-backfill` function first

## 📝 Checklist

- [ ] Deploy `sync-trips-incremental` function
- [ ] Deploy `reconcile-gps51-data` function  
- [ ] Test sync on single device
- [ ] Verify backfill window is ±15min
- [ ] Verify first sync gets 30 days
- [ ] Run reconciliation on test device
- [ ] Run reconciliation on all devices (production)
- [ ] Set up daily monitoring queries
- [ ] Document any issues found

## 🎯 Expected Timeline

- **Deployment:** 10 minutes
- **Testing:** 15 minutes
- **Reconciliation (single device):** 5 minutes
- **Reconciliation (all devices):** 2-4 hours
- **Total:** ~3-5 hours for complete deployment and reconciliation

---

**Questions?** Check the detailed documentation:
- `GPS51_RECONCILIATION_AUDIT_REPORT.md` - Full audit findings
- `GPS51_RECONCILIATION_IMPLEMENTATION_SUMMARY.md` - Implementation details
