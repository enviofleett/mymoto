# Deploy Telemetry Normalizer - Quick Start

## 🚀 Fastest Method: Supabase CLI

### Step 1: Install Supabase CLI

```bash
# macOS (using Homebrew)
brew install supabase/tap/supabase

# OR using npm
npm install -g supabase
```

### Step 2: Login & Link Project

```bash
# Login to Supabase
supabase login

# Link your project
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase link --project-ref cmvpnsqiefbsqkwnraka
```

### Step 3: Deploy All Functions

```bash
# Option A: Use the deployment script
./deploy-telemetry-normalizer.sh

# Option B: Deploy manually
supabase functions deploy gps-data
supabase functions deploy gps-history-backfill
supabase functions deploy sync-trips-incremental
```

**That's it!** The CLI automatically bundles the shared `_shared/telemetry-normalizer.ts` module.

---

## 📋 Alternative: Manual Dashboard Deployment

If you can't use CLI, you'll need to inline the normalizer code. See `DEPLOY_TELEMETRY_NORMALIZER_DASHBOARD.md` for details.

**However, CLI is strongly recommended** because:
- ✅ Automatically handles shared modules
- ✅ Faster deployment
- ✅ Less error-prone
- ✅ Better for production

---

## ✅ Verify Deployment

After deployment, check logs:

```bash
supabase functions logs gps-data --tail
```

**Look for:**
- No import errors
- Speed normalization working
- Functions running successfully

---

## 🎯 What Changed

All GPS51 telemetry data now:
- ✅ Speed normalized to km/h (was mixed units)
- ✅ Ignition uses confidence scoring (was single signal)
- ✅ Battery maps voltage when percent missing
- ✅ Coordinates validated (rejects 0,0)
- ✅ Data quality scored (high/medium/low)

---

**Ready?** Run the commands above to deploy!


