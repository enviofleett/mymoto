# Deploy GPS-Data Edge Function - Fix for 32-bit Status

## 🚀 Quick Deploy (Choose One Method)

### **Method 1: Supabase CLI (Recommended)** ⭐

**Prerequisites:**
- Supabase CLI installed
- Logged into Supabase
- Project linked

**Steps:**

1. **Navigate to project root:**
   ```bash
   cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
   ```

2. **Check if Supabase CLI is installed:**
   ```bash
   supabase --version
   ```
   
   If not installed:
   ```bash
   # macOS
   brew install supabase/tap/supabase
   
   # Or via npm
   npm install -g supabase
   ```

3. **Login to Supabase (if not already):**
   ```bash
   supabase login
   ```

4. **Link your project (if not already linked):**
   ```bash
   supabase link --project-ref cmvpnsqiefbsqkwnraka
   ```

5. **Deploy the gps-data function:**
   ```bash
   supabase functions deploy gps-data
   ```

   This will:
   - Deploy `supabase/functions/gps-data/index.ts`
   - Include `supabase/functions/_shared/telemetry-normalizer.ts` (where the fix is)
   - Update the function with the 32-bit status handling fix

6. **Verify deployment:**
   ```bash
   supabase functions list
   ```
   
   You should see `gps-data` in the list.

---

### **Method 2: Supabase Dashboard** (Easiest - No CLI Required)

1. **Go to Edge Functions:**
   - Open: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
   - Find the `gps-data` function in the list

2. **Update the function:**
   - Click on `gps-data` function
   - Click **"Edit"** or **"Update"**
   - The function will automatically pull the latest code from your repository (if connected) OR
   - Manually copy/paste the updated code from `supabase/functions/gps-data/index.ts`

3. **Important:** The fix is in `_shared/telemetry-normalizer.ts`
   - If deploying via Dashboard, make sure the shared module is also updated
   - The Dashboard deployment should automatically include shared modules

4. **Deploy:**
   - Click **"Deploy"** or **"Save"**
   - Wait for deployment to complete (usually 30-60 seconds)

---

### **Method 3: GitHub Integration** (Automatic)

If you have GitHub integration enabled:

1. **Commit and push your changes:**
   ```bash
   git add supabase/functions/_shared/telemetry-normalizer.ts
   git commit -m "Fix: Remove 32-bit status range restrictions"
   git push origin main
   ```

2. **Supabase will auto-deploy:**
   - Go to: Settings → Edge Functions
   - Check if "Deploy on push" is enabled
   - The function will automatically redeploy when you push

---

## ✅ Verify the Fix

After deployment, check the logs to confirm the fix is working:

1. **Go to Edge Function Logs:**
   - Dashboard → Edge Functions → `gps-data` → Logs

2. **Look for:**
   - ✅ **Should see:** `[checkJt808AccBit] ACC ON detected: base bit 0 (status=262151, ...)`
   - ❌ **Should NOT see:** `Status value exceeds expected range (0-65535)`
   - ❌ **Should NOT see:** `Negative status value: -1`

3. **Test with a device:**
   - Wait for the next GPS sync (every 60 seconds based on your CRON)
   - Check logs for status values like 262150, 262151
   - Verify no warnings appear

---

## 🔧 Troubleshooting

### Error: "Function not found"
- Make sure the function exists in `supabase/functions/gps-data/`
- Check that `index.ts` exists in that directory

### Error: "Project not linked"
```bash
supabase link --project-ref cmvpnsqiefbsqkwnraka
```

### Error: "Not authenticated"
```bash
supabase login
```

### Changes not appearing after deployment
- Wait 1-2 minutes for deployment to propagate
- Check function logs to see if new code is running
- Verify the deployment timestamp in Dashboard

### Still seeing old warnings
- Clear browser cache if viewing logs in Dashboard
- Wait for next GPS sync cycle (60 seconds)
- Check that you deployed the correct function (`gps-data`, not `gps-acc-report`)

---

## 📝 What Changed

The fix updates `supabase/functions/_shared/telemetry-normalizer.ts`:
- ✅ Removed 65535 range restriction
- ✅ Removed "exceeds expected range" warning
- ✅ Removed negative value check (handled by `>>> 0`)
- ✅ Now accepts full 32-bit unsigned integer range (0 to 4,294,967,295)

The `gps-data` function uses this shared module, so deploying `gps-data` will include the fix.
