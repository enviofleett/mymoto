# Fix Email CORS Error

## Error Message
```
Access to fetch at 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/send-email' 
from origin 'http://localhost:8080' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
It does not have HTTP ok status.
```

## Root Cause
The Edge Function's OPTIONS preflight handler may not be returning HTTP 200 OK correctly, or the function hasn't been deployed with the latest CORS fixes.

## Fix Applied
Updated `supabase/functions/send-email/index.ts`:
1. Simplified OPTIONS handler to return `"ok"` with status 200 (matching other working functions)
2. Ensured CORS headers are properly set
3. Added explicit status 200 for OPTIONS requests

## Deployment Steps

### Option 1: Deploy via Supabase CLI (Recommended)
```bash
# Make sure you're in the project root
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Deploy the send-email function
supabase functions deploy send-email

# If you need to set secrets (Gmail credentials)
supabase secrets set GMAIL_USER=your-email@gmail.com
supabase secrets set GMAIL_APP_PASSWORD=your-app-password
```

### Option 2: Deploy via Supabase Dashboard
1. Go to https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Find the `send-email` function
3. Click "Edit" or "Deploy"
4. Copy the entire contents of `supabase/functions/send-email/index.ts`
5. Paste into the editor
6. Click "Deploy" or "Save"

## Verify Deployment
After deploying, test the function:
1. Go to Admin Email Templates page
2. Click "Send Test Email" on any template
3. The CORS error should be resolved

## If Error Persists

### Check Function Logs
```bash
# View function logs
supabase functions logs send-email
```

### Verify CORS Headers
The function should return these headers for OPTIONS:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Max-Age: 86400`

### Test OPTIONS Request Manually
```bash
curl -X OPTIONS \
  https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/send-email \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  -v
```

Expected response:
- Status: 200 OK
- Headers include all CORS headers above

## Code Changes Made

### Before:
```typescript
if (req.method === "OPTIONS") {
  return new Response(null, { 
    status: 200,
    headers: corsHeaders 
  });
}
```

### After:
```typescript
if (req.method === "OPTIONS") {
  return new Response("ok", { 
    status: 200,
    headers: corsHeaders 
  });
}
```

The change from `null` to `"ok"` matches the pattern used in other working Edge Functions in the codebase.
