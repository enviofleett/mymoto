# Fix 401 Unauthorized Error for sync-trips-incremental

## 🔴 Problem
Getting `401 (Unauthorized)` when clicking the sync button.

## ✅ Solution: Disable JWT Verification in Supabase Dashboard

The function is currently requiring authentication, but it should work without JWT verification since it uses the service role key internally.

### Step-by-Step Fix:

1. **Go to Supabase Dashboard:**
   - Open: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions

2. **Find the Function:**
   - Look for `sync-trips-incremental` in the list
   - Click on it to open the function details

3. **Open Settings/Configuration:**
   - Look for a **"Settings"** tab or **"Configuration"** section
   - Or look for a gear icon ⚙️ or settings button

4. **Disable JWT Verification:**
   - Find the option: **"Verify JWT"** or **"Require Authentication"** or **"JWT Verification"**
   - **Turn it OFF** (set to `false` or uncheck the box)
   - This should be similar to other functions like `gps-data`, `process-trips`, etc.

5. **Save the Changes:**
   - Click **"Save"** or **"Update"**
   - Wait for the function to redeploy

6. **Test:**
   - Refresh your browser
   - Try the sync button again
   - The 401 error should be gone

---

## 🔍 Alternative: If You Can't Find the Setting

If the dashboard doesn't show a JWT verification toggle, the function might be using default settings. Try:

### Option A: Redeploy the Function
1. Copy the code from `supabase/functions/sync-trips-incremental/index.ts`
2. Delete the existing function
3. Create a new function with the same name
4. Paste the code
5. Make sure to set environment variables

### Option B: Use Supabase CLI
If you have Supabase CLI installed:
```bash
# Link project
supabase link --project-ref cmvpnsqiefbsqkwnraka

# Deploy with config (this will use verify_jwt = false from config.toml)
supabase functions deploy sync-trips-incremental
```

---

## 🧪 Verify It's Working

After disabling JWT verification, test with:

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Content-Type: application/json' \
  -d '{"device_ids": ["YOUR_DEVICE_ID"], "force_full_sync": false}'
```

If it works without an Authorization header, JWT verification is disabled.

---

## 📝 Note

The `config.toml` file has `verify_jwt = false` for this function, but when deploying via the Supabase Dashboard (not CLI), the dashboard settings take precedence. You must manually disable JWT verification in the dashboard.

---

**After fixing this, the sync button should work! 🎉**
