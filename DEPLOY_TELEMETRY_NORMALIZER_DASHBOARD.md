# Deploy Telemetry Normalizer via Supabase Dashboard

## ⚠️ Important Note

**Dashboard deployment doesn't support shared modules (`_shared/`).**

You have two options:
1. **Use Supabase CLI** (recommended) - Automatically bundles shared modules
2. **Inline the normalizer** into each function (this guide)

---

## Quick Option: Use CLI Instead

If possible, use the CLI script:

```bash
./deploy-telemetry-normalizer.sh
```

This automatically handles shared modules. **Skip this guide if using CLI.**

---

## Dashboard Deployment (Manual Inline Method)

If you must use Dashboard, you need to inline the normalizer code into each function.

### Step 1: Prepare Inlined Functions

I'll create inlined versions of each function that include the normalizer code directly.

### Step 2: Deploy Each Function

For each function:

1. **Go to:** https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. **Click function name** (or "Create new function")
3. **Copy code** from the inlined version
4. **Paste** into Dashboard editor
5. **Click "Deploy"**

---

## Functions to Deploy

1. `gps-data`
2. `gps-history-backfill`
3. `sync-trips-incremental`

---

## Verification

After deployment, check logs in Dashboard:
- Edge Functions → [function name] → Logs

Look for:
- ✅ No import errors
- ✅ Speed normalization working
- ✅ Ignition detection using confidence scoring

---

**Recommendation:** Use CLI method (`./deploy-telemetry-normalizer.sh`) instead of Dashboard for easier deployment.


