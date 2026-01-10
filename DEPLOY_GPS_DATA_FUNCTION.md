# Deploy GPS-Data Edge Function - Complete Guide

## 🚨 Problem Identified
The `gps-data` Edge Function is **not deployed** to your Supabase project. This is why:
- RSH128EA and other vehicles aren't syncing from GPS51
- No GPS position data is being updated
- Frontend shows empty data for all vehicles

---

## ✅ Solution: Deploy the Edge Function

### **Option 1: Deploy via Supabase Dashboard** ⭐ EASIEST

1. **Go to Edge Functions in Supabase Dashboard:**
   - Open: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
   - Click: **"Deploy a new function"** or **"Create Function"**

2. **Create the function:**
   - **Function name:** `gps-data`
   - **Copy and paste the code** from: `/home/user/fleet-flow/supabase/functions/gps-data/index.ts`

3. **Set the following environment variables** (if not already set):
   - `SUPABASE_URL`: Your Supabase URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key
   - `CORS_PROXY_URL`: Your CORS proxy URL

4. **Deploy the function**

---

### **Option 2: Deploy via GitHub Integration** ⭐ RECOMMENDED FOR CI/CD

If you have GitHub integration set up:

1. **Push your code to GitHub:**
   ```bash
   git push origin your-branch
   ```

2. **Enable Edge Functions deployment in Supabase:**
   - Go to: Settings → Edge Functions
   - Enable: "Deploy on push"
   - Select branch: `main` or your deployment branch

3. **Supabase will auto-deploy** the function on next push

---

### **Option 3: Deploy via Supabase CLI (Local)**

If you want to use the CLI:

1. **Install Supabase CLI:**
   ```bash
   # For Linux/macOS
   brew install supabase/tap/supabase

   # Or download binary from:
   # https://github.com/supabase/cli/releases
   ```

2. **Login to Supabase:**
   ```bash
   supabase login
   ```

3. **Link your project:**
   ```bash
   supabase link --project-ref cmvpnsqiefbsqkwnraka
   ```

4. **Deploy the function:**
   ```bash
   supabase functions deploy gps-data
   ```

---

## 🔧 After Deployment: Test the Function

### **Step 1: Invoke the Function Manually**

Go to: **Edge Functions** → **gps-data** → **Invoke**

Or use this API call:
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

### **Step 2: Check if Vehicles Synced**

Run this query in SQL Editor:
```sql
SELECT device_id, device_name, last_updated
FROM vehicles
ORDER BY last_updated DESC
LIMIT 10;
```

You should see vehicles imported from GPS51!

### **Step 3: Check for RSH128EA**

```sql
SELECT * FROM vehicles WHERE device_id = 'RSH128EA';
```

If still not found, check:
- GPS51 account to verify RSH128EA exists there
- Edge Function logs for errors

---

## ⚙️ Set Up Automatic Syncing (CRON Job)

Once deployed, set up automatic syncing:

### **Option A: Supabase CRON Extension**

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule GPS sync every 30 seconds
SELECT cron.schedule(
  'gps-sync-job',
  '*/30 * * * * *',  -- Every 30 seconds
  $$
  SELECT net.http_post(
    url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY')
  );
  $$
);
```

### **Option B: External CRON Service**

Use a service like:
- **Vercel Cron** (if hosting frontend on Vercel)
- **GitHub Actions** (scheduled workflows)
- **Cron-job.org** (free CRON service)

Example GitHub Action (`.github/workflows/gps-sync.yml`):
```yaml
name: GPS Data Sync
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger GPS Sync
        run: |
          curl -X POST '${{ secrets.SUPABASE_URL }}/functions/v1/gps-data' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}'
```

---

## 🎯 Quick Start: Immediate Fix

**If you need RSH128EA working NOW:**

1. **Deploy the function via Supabase Dashboard** (Option 1 above)
2. **Manually invoke it once** to sync all vehicles
3. **Check if RSH128EA appears** in the vehicles table
4. **Set up automatic syncing** using CRON

---

## 📋 Checklist

- [ ] Deploy `gps-data` Edge Function
- [ ] Invoke function manually to test
- [ ] Verify vehicles appear in database
- [ ] Check for RSH128EA specifically
- [ ] Set up automatic CRON sync
- [ ] Monitor Edge Function logs for errors

---

## 🆘 Troubleshooting

### **Function deploys but no vehicles sync:**
- Check Edge Function logs for errors
- Verify GPS51 token exists in `app_settings` table
- Test GPS51 API credentials

### **RSH128EA still not found after sync:**
- Verify device exists in GPS51 account
- Check device_id spelling/format in GPS51
- Look for case sensitivity issues

### **Permission errors:**
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set
- Check RLS policies on `vehicles` table

---

**Next Step:** Deploy the function using Option 1 (Supabase Dashboard) - it's the fastest!
