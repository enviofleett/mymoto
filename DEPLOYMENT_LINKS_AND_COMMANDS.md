# 🚀 Deployment Links and Commands

This document contains all deployment links and commands for quick reference.

## 📦 Current Deployment: sync-trips-incremental (Enhanced Error Handling)

### 🔗 Quick Links

- **Supabase Dashboard**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
- **Edge Functions**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
- **Function Logs**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions/sync-trips-incremental/logs
- **SQL Editor**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new

### 📝 Deployment Commands

#### Option 1: Automated Script (Recommended)
```bash
./scripts/deploy-sync-trips-incremental.sh
```

#### Option 2: Manual CLI Deploy
```bash
supabase functions deploy sync-trips-incremental --no-verify-jwt
```

#### Option 3: Via Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click on `sync-trips-incremental` function
3. Click **"Deploy"** or **"Redeploy"**

### 📋 Full Documentation
- **Detailed Guide**: [DEPLOY_SYNC_TRIPS_INCREMENTAL_FIX.md](./DEPLOY_SYNC_TRIPS_INCREMENTAL_FIX.md)
- **Function Code**: `supabase/functions/sync-trips-incremental/index.ts`

---

## 🔄 All Edge Functions Deployment

### sync-trips-incremental
```bash
supabase functions deploy sync-trips-incremental --no-verify-jwt
```
**Purpose**: Syncs vehicle trips from GPS51 API with enhanced error handling

### proactive-alarm-to-chat
```bash
supabase functions deploy proactive-alarm-to-chat
```
**Purpose**: Converts vehicle alarms to proactive AI chat messages

### retry-failed-notifications
```bash
supabase functions deploy retry-failed-notifications
```
**Purpose**: Retries failed proactive chat notifications

### check-geofences
```bash
supabase functions deploy check-geofences
```
**Purpose**: Detects geofence entry/exit events

### gps-data
```bash
supabase functions deploy gps-data
```
**Purpose**: Fetches live GPS data from GPS51

### fetch-mileage-detail
```bash
supabase functions deploy fetch-mileage-detail
```
**Purpose**: Fetches mileage details from GPS51 with fuel consumption estimates

---

## 🗄️ Database Migrations

### Apply All Migrations
```bash
supabase db push
```

### Individual Migrations (via SQL Editor)

1. **Trip Sync Progress** (if not applied):
   - File: `supabase/migrations/20260119000004_add_trip_sync_progress.sql`
   - Link: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new
   - Copy and paste the SQL content

2. **Vehicle Specifications**:
   - File: `supabase/migrations/20260119000000_create_vehicle_specifications.sql`
   - Link: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new

3. **Mileage Details**:
   - File: `supabase/migrations/20260119000001_create_mileage_detail_table.sql`
   - Link: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new

---

## 🔍 Verification Commands

### Check Function Status
```bash
supabase functions list
```

### View Function Logs
```bash
supabase functions logs sync-trips-incremental --tail
```

### Test Function Locally
```bash
supabase functions serve sync-trips-incremental
```

---

## 🛠️ Environment Variables

### Required Variables (Set in Supabase Dashboard)

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/settings/functions
2. Add/Verify these variables:

| Variable | Description | Where to Find |
|----------|-------------|---------------|
| `DO_PROXY_URL` | DigitalOcean proxy URL | Your DO proxy endpoint |
| `SUPABASE_URL` | Supabase project URL | Auto-set, usually `https://cmvpnsqiefbsqkwnraka.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Settings → API → service_role key |

---

## 📚 Related Documentation

- **Trip Sync Setup**: [TRIP_SYNC_SETUP.md](./TRIP_SYNC_SETUP.md)
- **GPS51 Implementation**: [GPS51_MISSING_APIS_IMPLEMENTATION_PLAN.md](./GPS51_MISSING_APIS_IMPLEMENTATION_PLAN.md)
- **Production Readiness**: [PRODUCTION_READINESS_CHECKLIST.md](./PRODUCTION_READINESS_CHECKLIST.md)

---

## 🆘 Quick Troubleshooting

### Function Not Deploying
1. Check Supabase CLI is installed: `supabase --version`
2. Verify you're logged in: `supabase login`
3. Check project is linked: `supabase projects list`

### Function Errors After Deployment
1. Check logs: `supabase functions logs sync-trips-incremental --tail`
2. Verify environment variables are set
3. Check GPS51 token is valid (admin login required)

### Database Column Errors
- Apply migration: `supabase/migrations/20260119000004_add_trip_sync_progress.sql`
- Or function will gracefully degrade (works without new columns)

---

**Last Updated**: $(date)
**Quick Reference**: Bookmark this file for easy access to all deployment commands!
