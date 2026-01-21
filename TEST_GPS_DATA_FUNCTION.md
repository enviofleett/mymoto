# How to Test the GPS-Data Edge Function

## Quick Test Steps

### 1. **Via Supabase Dashboard (Easiest)**

1. Go to **Supabase Dashboard** → **Edge Functions** → **gps-data**
2. Click the **"Invoke"** tab
3. Set **HTTP Method** to `POST`
4. In **Request Body**, paste:
   ```json
   {
     "action": "lastposition",
     "use_cache": false
   }
   ```
5. Click **"Send Request"**
6. Check the response and logs

### 2. **What to Expect**

**Success Response:**
```json
{
  "data": {
    "status": 0,
    "records": [...]
  }
}
```

**Error Response:**
```json
{
  "error": "Error message here"
}
```

### 3. **Common Issues & Solutions**

#### Issue: "Cannot read properties of undefined (reading 'error')"
- **Cause**: The function is trying to access `.error` on an undefined object
- **Solution**: Fixed in the latest code - ensure you've deployed the updated function
- **Check**: Look at Edge Function logs for the exact line number

#### Issue: 504 Gateway Timeout
- **Cause**: Function is taking too long (likely due to large SQL queries)
- **Solution**: 
  - Use `use_cache: true` for faster responses
  - Check if database queries are optimized
  - Consider reducing the number of devices queried

#### Issue: "Missing DO_PROXY_URL secret"
- **Cause**: Environment variable not set
- **Solution**: Go to **Edge Functions** → **gps-data** → **Settings** → **Secrets** and add `DO_PROXY_URL`

#### Issue: "No GPS token found"
- **Cause**: Token not set in database
- **Solution**: Admin needs to log in via GPS51 to generate token

### 4. **Testing Different Actions**

#### Test Last Position (Most Common)
```json
{
  "action": "lastposition",
  "use_cache": false
}
```

#### Test Query Monitor List
```json
{
  "action": "querymonitorlist",
  "use_cache": false
}
```

#### Test with Cache (Faster)
```json
{
  "action": "lastposition",
  "use_cache": true
}
```

### 5. **Check Logs**

After invoking, check the **"Logs"** tab to see:
- Function execution steps
- API calls made
- Any errors or warnings
- Performance metrics

### 6. **Verify Results**

After successful invocation, verify data was updated:

```sql
-- Check if positions were updated
SELECT 
  device_id,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  last_synced_at
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '5 minutes'
ORDER BY last_synced_at DESC
LIMIT 10;
```

### 7. **Via curl (Terminal)**

```bash
curl -X POST 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/gps-data' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "lastposition",
    "use_cache": false
  }'
```

Replace:
- `YOUR_PROJECT_ID` with your Supabase project ID
- `YOUR_ANON_KEY` with your Supabase anonymous key

### 8. **Debugging Tips**

1. **Check Function Logs**: Most detailed information
2. **Check Database Logs**: See if queries are timing out
3. **Check API Response**: Look at the actual GPS51 API response
4. **Test with Single Device**: Add `body_payload: { deviceids: ["DEVICE_ID"] }` to test with one device
5. **Check Rate Limits**: Look for 8902 errors (IP rate limit)

### 9. **Expected Behavior**

✅ **Function should:**
- Fetch latest positions from GPS51
- Calculate ignition confidence scores
- Update `vehicle_positions` table
- Insert into `position_history` (if movement detected)
- Return success response

❌ **Function should NOT:**
- Timeout (>60 seconds)
- Return 500 errors
- Access undefined properties
- Skip rate limiting

### 10. **If Still Having Issues**

1. **Check Edge Function Deployment**: Ensure latest code is deployed
2. **Check Environment Variables**: Verify all secrets are set
3. **Check Database**: Ensure tables exist and are accessible
4. **Check GPS51 Token**: Verify token is valid and not expired
5. **Check Rate Limits**: Ensure you're not hitting GPS51 rate limits

## Quick Fix for Current Error

If you're seeing "Cannot read properties of undefined (reading 'error')":

1. **Redeploy the function** with the latest fixes
2. **Check the logs** for the exact line causing the error
3. **Verify** the function is using the updated code

The fix adds proper null checks and error handling to prevent accessing `.error` on undefined objects.
