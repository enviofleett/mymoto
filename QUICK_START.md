# GPS51 Data Sync - Quick Start Guide

## 🚀 Quick Deployment (5 Minutes)

### Prerequisites
- Supabase Dashboard access
- GPS51 credentials configured

### Option 1: Automated Deployment (Recommended)

If you have Supabase CLI installed:

```bash
# Run the deployment script
./scripts/deploy-gps51-sync.sh
```

The script will:
1. ✅ Link to your Supabase project
2. ✅ Apply database migrations
3. ✅ Deploy Edge Functions
4. ✅ Guide you through app settings
5. ✅ Test manual sync

### Option 2: Manual Deployment

Follow these steps in Supabase Dashboard:

#### Step 1: Apply Migrations (2 min)

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy contents of `supabase/migrations/20260124000000_create_gps51_sync_tables.sql`
3. Paste and click **Run**
4. Repeat for `supabase/migrations/20260124000001_setup_gps51_sync_cron.sql`

#### Step 2: Configure Settings (1 min)

Run in SQL Editor:

```sql
-- Get your service role key from: Dashboard → Project Settings → API
SELECT set_app_setting('supabase_url', 'https://cmvpnsqiefbsqkwnraka.supabase.co');
SELECT set_app_setting('supabase_service_role_key', 'YOUR_SERVICE_ROLE_KEY');
```

#### Step 3: Deploy Functions (2 min)

**Option A: Using Dashboard**
1. Go to **Edge Functions** → **Deploy new function**
2. Name: `sync-gps51-trips`
3. Copy code from `supabase/functions/sync-gps51-trips/index.ts`
4. Deploy
5. Repeat for `sync-gps51-alarms`

**Option B: Using CLI**
```bash
supabase functions deploy sync-gps51-trips
supabase functions deploy sync-gps51-alarms
```

---

## ✅ Verify Deployment

### Quick Test (1 min)

```sql
-- Test trip sync
SELECT trigger_gps51_trips_sync('YOUR_DEVICE_ID', 7);

-- Check if data was synced
SELECT COUNT(*) FROM gps51_trips WHERE device_id = 'YOUR_DEVICE_ID';
```

### Full Verification

1. **Check GPS51 Platform**
   - Go to: Reports → Trip Report
   - Note trip count for today

2. **Check Dashboard Database**
   ```sql
   SELECT COUNT(*) FROM gps51_trips
   WHERE device_id = 'YOUR_DEVICE_ID'
     AND start_time::date = CURRENT_DATE;
   ```

3. **Compare**: Numbers should match ✅

---

## 📊 What Changed?

### Before (Mixed Data Sources) ❌
```
GPS51 Platform: 10 trips, 150 km
Dashboard:       8 trips, 142 km  ← Different!
```

### After (100% GPS51 Data) ✅
```
GPS51 Platform: 10 trips, 150 km
Dashboard:      10 trips, 150 km  ← Exact match!
```

---

## 🔄 Automatic Sync

Once deployed, data syncs automatically:
- **Trips**: Every 10 minutes
- **Alarms**: Every 5 minutes

Monitor sync status:
```sql
SELECT * FROM gps51_sync_status ORDER BY updated_at DESC;
```

---

## 📚 Documentation

- **DEPLOYMENT_GUIDE.md** - Detailed deployment instructions
- **TESTING_GUIDE_GPS51_SYNC.md** - Complete testing procedures
- **DIAGNOSIS_GPS51_DATA_SYNC.md** - Root cause analysis
- **CURSOR_VALIDATION_PROMPT.md** - Code validation

---

## 🆘 Troubleshooting

### Issue: No data after sync

**Solution**:
```sql
-- Check sync status
SELECT * FROM gps51_sync_status WHERE device_id = 'YOUR_DEVICE_ID';

-- Check for errors
SELECT trip_sync_error, alarm_sync_error
FROM gps51_sync_status
WHERE device_id = 'YOUR_DEVICE_ID';
```

### Issue: Data doesn't match GPS51

**Solution**:
- Wait 10 minutes for next sync
- Verify same date range in both platforms
- Check time zone settings (GPS51 uses GMT+8)

### Issue: Cron jobs not running

**Solution**:
```sql
-- Check if jobs exist
SELECT * FROM cron.job WHERE jobname LIKE 'sync-gps51%';

-- Check recent runs
SELECT * FROM cron.job_run_details
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'sync-gps51%')
ORDER BY start_time DESC LIMIT 5;
```

---

## 🎯 Success Criteria

Deployment is successful when:

✅ Trip counts match GPS51 platform 100%
✅ Trip distances match GPS51 platform 100%
✅ Alarm counts match GPS51 platform 100%
✅ Data syncs automatically every 5-10 minutes
✅ No console errors in browser
✅ Frontend displays GPS51 data

---

## 🚀 Ready to Deploy?

Choose your method:

**Automated**: `./scripts/deploy-gps51-sync.sh`

**Manual**: Follow steps above or see DEPLOYMENT_GUIDE.md

**Questions**: Check documentation files or troubleshooting section

---

**Estimated deployment time**: 5-10 minutes
**Difficulty**: Easy
**Required access**: Supabase Dashboard, SQL Editor
