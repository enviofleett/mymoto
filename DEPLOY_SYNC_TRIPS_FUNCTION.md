# Deploy sync-trips-incremental Edge Function

## 🚀 Quick Deploy via Supabase Dashboard (Easiest)

### Step 1: Go to Edge Functions
1. Open: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click **"Create a new function"** or **"Deploy a new function"**

### Step 2: Create the Function
1. **Function name:** `sync-trips-incremental`
2. **Copy the code** from: `supabase/functions/sync-trips-incremental/index.ts`
3. Paste it into the code editor

### Step 3: Configure Function Settings
**IMPORTANT:** After creating the function, you MUST disable JWT verification:

1. In the function editor, look for **"Settings"** or **"Configuration"** tab
2. Find **"Verify JWT"** or **"Require Authentication"** option
3. **Turn it OFF** or set to **"false"**
4. This allows the function to be called without JWT verification

### Step 4: Set Environment Variables
The function needs these environment variables (they should already be set globally):
- `SUPABASE_URL` - Your Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key

To check/set them:
1. Go to: Settings → Edge Functions → Environment Variables
2. Make sure these are set:
   - `SUPABASE_URL` = `https://cmvpnsqiefbsqkwnraka.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = (your service role key from Settings → API)

### Step 4: Deploy
1. Click **"Deploy"** or **"Save"**
2. Wait for deployment to complete

### Step 6: Test
After deployment, test it:
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"device_ids": ["YOUR_DEVICE_ID"], "force_full_sync": false}'
```

---

## 🔧 Alternative: Deploy via Supabase CLI

### Step 1: Install Supabase CLI
```bash
# macOS
brew install supabase/tap/supabase

# Or via npm
npm install -g supabase
```

### Step 2: Login
```bash
supabase login
```

### Step 3: Link Your Project
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase link --project-ref cmvpnsqiefbsqkwnraka
```

### Step 4: Deploy
```bash
supabase functions deploy sync-trips-incremental
```

---

## ✅ Verify Deployment

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. You should see `sync-trips-incremental` in the list
3. Click on it to see logs and details

---

## 🐛 Troubleshooting

### Function not appearing
- Make sure you're in the correct Supabase project
- Check that the function name matches exactly: `sync-trips-incremental`

### CORS errors still happening
- Make sure you deployed the latest version with CORS fixes
- Clear browser cache and try again
- Check function logs in Supabase dashboard

### Environment variables missing
- Go to Settings → Edge Functions → Environment Variables
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` if not already set

---

**After deployment, the sync button should work! 🎉**
