# Deploy Telemetry Normalizer - Complete Guide

## What's Being Deployed

1. **New Shared Module:** `_shared/telemetry-normalizer.ts`
2. **Updated Functions:**
   - `gps-data` - Uses normalizer for all position data
   - `gps-history-backfill` - Uses normalizer for track history
   - `sync-trips-incremental` - Uses normalizer for speed normalization

---

## Option 1: Deploy via Supabase CLI (Recommended)

### Step 1: Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Or via npm
npm install -g supabase
```

### Step 2: Login to Supabase

```bash
supabase login
```

### Step 3: Link Your Project

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase link --project-ref cmvpnsqiefbsqkwnraka
```

### Step 4: Deploy Functions

```bash
# Deploy all updated functions
supabase functions deploy gps-data
supabase functions deploy gps-history-backfill
supabase functions deploy sync-trips-incremental
```

**Note:** The CLI automatically bundles shared modules (`_shared/telemetry-normalizer.ts`), so no inlining needed!

---

## Option 2: Deploy via Supabase Dashboard

**⚠️ IMPORTANT:** Dashboard deployment doesn't support shared modules. You need to inline the normalizer code into each function.

### Step 1: Inline Normalizer for Dashboard Deployment

Since Dashboard doesn't bundle `_shared` modules, you have two choices:

**Choice A:** Use Supabase CLI (supports shared modules automatically)
**Choice B:** Inline the normalizer code into each function (see instructions below)

### Step 2: Deploy Each Function

For each function (`gps-data`, `gps-history-backfill`, `sync-trips-incremental`):

1. **Go to Supabase Dashboard:**
   - https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions

2. **Find the function** (or create if new)

3. **Copy the code** from:
   - `supabase/functions/gps-data/index.ts`
   - `supabase/functions/gps-history-backfill/index.ts`
   - `supabase/functions/sync-trips-incremental/index.ts`

4. **Paste into the Dashboard editor**

5. **Click "Deploy"**

---

## Option 3: Inline Normalizer for Dashboard (If Needed)

If you must use Dashboard and shared modules don't work, inline the normalizer:

### For `gps-data/index.ts`:

Replace:
```typescript
import { normalizeVehicleTelemetry, type Gps51RawData } from "../_shared/telemetry-normalizer.ts"
```

With the full normalizer code inline (copy entire `telemetry-normalizer.ts` content).

**However, this is NOT recommended** - use CLI instead for cleaner code.

---

## Verification Steps

### 1. Check Function Logs

After deployment, check logs to verify normalizer is working:

```bash
# Via CLI
supabase functions logs gps-data --tail

# Or in Dashboard
# Go to: Edge Functions → gps-data → Logs
```

**Look for:**
- No import errors
- Speed values in km/h (not raw m/h)
- Ignition detection using confidence scoring

### 2. Test Speed Normalization

**Before:** GPS51 returns `speed: 5000` → Database stores `speed: 5000`
**After:** GPS51 returns `speed: 5000` → Database stores `speed: 5` (km/h)

### 3. Test Ignition Detection

**Before:** Only checks `strstatus.includes('ACC ON')`
**After:** Uses multi-signal confidence scoring

### 4. Test Battery Mapping

**Before:** Only uses `voltagepercent` if > 0
**After:** Maps `voltagev` to percentage when percent missing

---

## Quick Deploy Script

Create a script to deploy all functions at once:

```bash
#!/bin/bash
# deploy-telemetry-normalizer.sh

echo "🚀 Deploying Telemetry Normalizer..."

supabase functions deploy gps-data
supabase functions deploy gps-history-backfill
supabase functions deploy sync-trips-incremental

echo "✅ All functions deployed!"
echo ""
echo "📊 Verify deployment:"
echo "   supabase functions logs gps-data --tail"
```

---

## Troubleshooting

### Error: "Module not found: _shared/telemetry-normalizer.ts"

**Solution:** Use Supabase CLI (Option 1) instead of Dashboard. CLI bundles shared modules automatically.

### Error: "Function deployment failed"

**Check:**
1. Are you logged in? `supabase login`
2. Is project linked? `supabase link --project-ref cmvpnsqiefbsqkwnraka`
3. Are environment variables set? Check Dashboard → Edge Functions → Settings

### Speed Still in Wrong Unit

**Check:**
1. Verify normalizer is imported: `grep "telemetry-normalizer" supabase/functions/gps-data/index.ts`
2. Check logs for normalization errors
3. Verify function was deployed (not just saved)

---

## Post-Deployment Checklist

- [ ] All 3 functions deployed successfully
- [ ] No import errors in logs
- [ ] Speed values are in km/h (check database)
- [ ] Ignition detection working (check vehicle_positions)
- [ ] Battery mapping working (check when voltagepercent is 0)
- [ ] Coordinate validation working (no 0,0 coordinates)

---

## Rollback Plan

If something goes wrong:

1. **Revert to previous version:**
   ```bash
   git checkout HEAD~1 supabase/functions/gps-data/index.ts
   supabase functions deploy gps-data
   ```

2. **Or restore from Dashboard:**
   - Go to function → History
   - Restore previous version

---

**Ready to deploy?** Start with Option 1 (CLI) for easiest deployment!


