# How to Invoke sync-trips-incremental Function

## ❌ Wrong: SQL Editor
The SQL Editor is for SQL queries, not for invoking Edge Functions.

## ✅ Correct: Edge Functions Invoke

### Step 1: Go to Edge Functions
1. In Supabase Dashboard, click **"Edge Functions"** in the left sidebar
2. Or go directly to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions

### Step 2: Open the Function
1. Find **`sync-trips-incremental`** in the list
2. Click on it to open

### Step 3: Invoke the Function
1. Click the **"Invoke"** tab (or "Test" tab)
2. In the request body field, paste:
   ```json
   {
     "device_ids": ["358657105967694"],
     "force_full_sync": true
   }
   ```
3. Click **"Invoke Function"** or **"Run"** button

### Step 4: Check Results
1. Check the **"Logs"** tab to see execution logs
2. Check the response in the **"Invoke"** tab
3. You should see:
   ```json
   {
     "success": true,
     "devices_processed": 1,
     "trips_created": 5,
     "trips_skipped": 0,
     ...
   }
   ```

## Alternative: Via Your App
1. Go to vehicle profile page for device `358657105967694`
2. Click the **"Sync"** button
3. Enable **"Force Full Sync"**
4. Click sync

## Alternative: Via curl (Terminal)
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "device_ids": ["358657105967694"],
    "force_full_sync": true
  }'
```

## What to Expect
- Function will call GPS51 querytrips API
- Rate limiting prevents spikes (100ms delays)
- Should return exactly 5 trips matching GPS51
- Check logs for detailed progress
