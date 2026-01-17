# 🚀 Deploy Telemetry Normalizer - Quick Guide

## Status: ❌ NOT DEPLOYED
Your verification check shows speeds > 200 (m/h), meaning the normalizer is not active yet.

## Option 1: Supabase CLI (Recommended - Supports Shared Modules)

### Step 1: Login to Supabase
```bash
supabase login
```

### Step 2: Link Project (if not already linked)
```bash
supabase link --project-ref cmvpnsqiefbsqkwnraka
```

### Step 3: Deploy Functions
```bash
# Deploy all three functions
supabase functions deploy gps-data
supabase functions deploy gps-history-backfill
supabase functions deploy sync-trips-incremental
```

### Step 4: Verify Deployment
Run the verification SQL script again to confirm speeds are normalized.

---

## Option 2: Supabase Dashboard (Manual - Requires Inlining)

If you prefer using the Dashboard, the shared modules need to be inlined. See `DEPLOY_TELEMETRY_NORMALIZER_DASHBOARD.md` for detailed instructions.

---

## What Gets Deployed?

1. **gps-data**: Normalizes live vehicle positions
2. **gps-history-backfill**: Normalizes historical track data
3. **sync-trips-incremental**: Normalizes trip speeds

All three functions now use the centralized `telemetry-normalizer.ts` module.

---

## After Deployment

1. Wait 1-2 minutes for the functions to process new data
2. Run the verification SQL script
3. Check that speeds are now ≤ 200 km/h
4. Verify ignition detection is working
5. Check battery mapping is accurate

---

## Troubleshooting

If deployment fails:
- Check you're logged in: `supabase projects list`
- Check project is linked: `cat .supabase/config.toml`
- Check function logs: `supabase functions logs gps-data --tail`


