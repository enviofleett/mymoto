# How to Invoke GPS-Data Function to Sync Vehicles

## Method 1: Supabase Dashboard (Easiest) ⭐

### Step-by-Step:

1. **Go to Supabase Dashboard:**
   - Open: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
   - Or navigate: **Edge Functions** → **gps-data**

2. **Click the "Invoke" Tab:**
   - You should see tabs: Overview, Invocations, Logs, Code, Details
   - Click on **"Invoke"** tab

3. **Configure the Request:**
   - **HTTP Method:** Should be `POST` (default)
   - **Request Body:** Paste this JSON:
     ```json
     {
       "action": "lastposition",
       "use_cache": false
     }
     ```
   - **Headers:** Leave empty (or add if needed)
   - **Query Parameters:** Leave empty

4. **Click "Send Request" or "Invoke Function"**
   - Button is usually green and says "Send Request" or "Invoke Function"

5. **Wait for Response:**
   - You should see a response like:
     ```json
     {
       "data": {
         "status": 0,
         "records": [...]
       }
     }
     ```
   - Or check the **"Logs"** tab to see progress

6. **Check Results:**
   - Wait 1-2 minutes for processing
   - Then run your quality check query again to see if confidence is populated

---

## Method 2: Via curl (Terminal)

If you prefer command line:

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "lastposition",
    "use_cache": false
  }'
```

**Replace:**
- `YOUR_ANON_KEY` with your Supabase anonymous key
  - Get it from: Supabase Dashboard → Settings → API → `anon` `public` key

---

## Method 3: Via Your Application

If your app has a "Sync" or "Refresh" button, clicking it will trigger the function.

---

## What Happens When You Invoke

1. **Fetches Latest Positions:**
   - Calls GPS51 API to get current vehicle positions
   - Gets raw status data for all devices

2. **Calculates Ignition Confidence:**
   - Uses `normalizeVehicleTelemetry()` function
   - Tries multiple detection methods:
     - Status bit (confidence 1.0)
     - String parsing (confidence 0.9)
     - Speed inference (confidence 0.3-0.5)
     - Multi-signal (confidence 0.6-0.7)

3. **Updates Database:**
   - Updates `vehicle_positions` table with confidence scores
   - Inserts into `position_history` with confidence scores

4. **Result:**
   - Devices that had `null` confidence should now have scores
   - `unknown` method should change to `status_bit`, `string_parse`, etc.

---

## Verify It Worked

After invoking, wait 1-2 minutes, then run:

```sql
-- Check if confidence was populated for those devices
SELECT 
  device_id,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  status_text,
  last_synced_at
FROM vehicle_positions
WHERE device_id IN (
  '13612331167', '13612331820', '13552345258', '13612331970',
  '13612333826', '13612335009', '13612331008', '13612333901',
  '13612331996', '13612331034'
)
ORDER BY last_synced_at DESC;
```

**Expected Results:**
- ✅ `ignition_confidence` should NOT be `null` (should be 0.0 to 1.0)
- ✅ `ignition_detection_method` should NOT be `unknown`
- ✅ `last_synced_at` should be recent (within last few minutes)

---

## Troubleshooting

### If function returns error:
- Check **Logs** tab for error messages
- Verify `DO_PROXY_URL` secret is set
- Verify GPS51 token exists and is valid

### If confidence is still null:
- Check edge function logs for those specific device IDs
- Verify the function processed those devices
- Check if devices have valid GPS51 data

### If function times out:
- This is normal for large fleets (600+ vehicles)
- Function will still process data in background
- Check logs to see progress

---

## Quick Reference

**Dashboard URL:**
```
https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions/gps-data
```

**Request Body:**
```json
{
  "action": "lastposition",
  "use_cache": false
}
```

**Expected Response:**
```json
{
  "data": {
    "status": 0,
    "records": [...]
  }
}
```
