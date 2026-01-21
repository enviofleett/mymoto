# Quick Deploy - Manual Steps

**Date:** 2026-01-21  
**Status:** Ready to deploy

---

## 🚀 Option 1: Deploy via Your Terminal (Recommended)

### Step 1: Login to Supabase CLI

Open your terminal and run:

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase login
```

This will open a browser window for authentication. Complete the login.

### Step 2: Link Project (if not already linked)

```bash
supabase link --project-ref cmvpnsqiefbsqkwnraka
```

### Step 3: Deploy Functions

```bash
# Deploy sync-trips-incremental
supabase functions deploy sync-trips-incremental

# Deploy reconcile-gps51-data
supabase functions deploy reconcile-gps51-data
```

---

## 🖥️ Option 2: Deploy via Supabase Dashboard (Easier)

### Deploy sync-trips-incremental

1. **Go to:** https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. **Find:** `sync-trips-incremental` function
3. **Click:** "Edit" or open the function
4. **Verify:** Code matches `supabase/functions/sync-trips-incremental/index.ts`
5. **Click:** "Deploy" or "Save"

### Deploy reconcile-gps51-data

1. **Go to:** https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. **Click:** "Create a new function" or "Deploy a new function"
3. **Function name:** `reconcile-gps51-data`
4. **Copy code** from: `supabase/functions/reconcile-gps51-data/index.ts`
5. **Paste** into the code editor
6. **Click:** "Deploy"

---

## ✅ Verify Deployment

### Test sync-trips-incremental:

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"device_ids": ["RBC784CX"], "force_full_sync": false}'
```

**Expected Response:**
```json
{
  "success": true,
  "devices_processed": 1,
  "trips_created": <number>,
  "trips_skipped": <number>,
  "duration_ms": <number>
}
```

### Test reconcile-gps51-data:

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"mode": "coordinates", "deviceId": "RBC784CX", "startDate": "2026-01-01", "endDate": "2026-01-21"}'
```

**Expected Response:**
```json
{
  "success": true,
  "mode": "coordinates",
  "deviceId": "RBC784CX",
  "results": {
    "tripsFixed": <number>,
    "tripsChecked": <number>,
    "coordinatesBackfilled": <number>
  }
}
```

---

## 📋 Next Steps After Deployment

1. **Test single device sync** (see NEXT_STEPS_ACTION_PLAN.md)
2. **Run reconciliation** on existing data
3. **Monitor improvements** in coordinate completeness

---

## 🆘 Troubleshooting

### "Access token not provided"
- Run `supabase login` first
- Or set `SUPABASE_ACCESS_TOKEN` environment variable

### "Function not found"
- Make sure function name matches exactly
- Check function exists in Supabase Dashboard

### Deployment fails
- Check Supabase Dashboard → Edge Functions → Logs
- Verify environment variables are set
- Check function code syntax

---

**Ready to deploy?** Choose Option 1 (Terminal) or Option 2 (Dashboard) above.
