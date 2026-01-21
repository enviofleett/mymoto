# Check GPS-Data Function Deployment Status

## Quick Check Methods

### Method 1: Supabase Dashboard (Easiest)

1. Go to: **https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions**
2. Look for **`gps-data`** in the list of functions
3. If it appears, it's deployed ✅
4. If it doesn't appear, it's NOT deployed ❌

### Method 2: Test the Function Endpoint

Try to invoke the function:

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"action": "lastposition", "use_cache": false}'
```

**Results:**
- ✅ **200/500 response** = Function is deployed (even if it errors, it means it exists)
- ❌ **404 Not Found** = Function is NOT deployed

### Method 3: Supabase CLI

If you have Supabase CLI installed:

```bash
# List all deployed functions
supabase functions list --project-ref cmvpnsqiefbsqkwnraka

# Or check specific function
supabase functions list --project-ref cmvpnsqiefbsqkwnraka | grep gps-data
```

### Method 4: Check Function Logs

1. Go to: **Edge Functions** → **gps-data** → **Logs**
2. If you see logs, the function is deployed ✅
3. If you get "Function not found", it's NOT deployed ❌

---

## If NOT Deployed - Deploy Now

### Quick Deploy via Dashboard:

1. Go to: **Edge Functions** → **Create Function**
2. Name: `gps-data`
3. Copy code from: `supabase/functions/gps-data/index.ts`
4. Paste and deploy

### Or Deploy via CLI:

```bash
supabase functions deploy gps-data --project-ref cmvpnsqiefbsqkwnraka
```

---

## Verify After Deployment

After deploying, test it:

1. Go to **Edge Functions** → **gps-data** → **Invoke**
2. Use this body:
   ```json
   {
     "action": "lastposition",
     "use_cache": false
   }
   ```
3. Click **"Send Request"**
4. Check for:
   - ✅ **200 status** = Success
   - ✅ **500 status with error message** = Deployed but has errors (check logs)
   - ❌ **404** = Still not deployed
