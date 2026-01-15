# Debug: Gemini API 400 Error

## Current Status
- ✅ Function is being invoked (200 status)
- ✅ Webhook is working
- ✅ Chat messages are being created (fallback format)
- ❌ Gemini API returning 400 Bad Request

## Enhanced Error Logging

I've updated the code to log **full error details** from Gemini API. After redeploying, check the logs for:

```
[Gemini Client] API error response: {
  status: 400,
  error: { ... full Gemini error ... }
}
```

This will show the **exact reason** for the 400 error.

## Common 400 Error Causes

### 1. Invalid API Key Format
- **Check:** API key should start with `AIza...`
- **Verify:** Go to https://aistudio.google.com/app/apikey
- **Fix:** Regenerate key if needed

### 2. API Key Not Set in Supabase
- **Check:** Dashboard → Edge Functions → Secrets
- **Verify:** `GEMINI_API_KEY` exists and is correct
- **Fix:** Add/update the secret

### 3. Model Not Available
- **Current:** Using `gemini-1.5-flash` (stable)
- **Check:** https://ai.google.dev/models/gemini
- **Fix:** Try `gemini-1.5-pro` if flash doesn't work

### 4. Request Format Issue
- **Check:** Logs will show the request body structure
- **Common issues:**
  - `systemInstruction` format wrong
  - `contents` structure incorrect
  - Missing required fields

### 5. API Quota/Billing
- **Check:** Google Cloud Console → Billing
- **Verify:** API is enabled and has quota
- **Fix:** Enable billing if needed

## Next Steps

### Step 1: Redeploy with Enhanced Logging
```bash
cd supabase/functions
supabase functions deploy proactive-alarm-to-chat
```

### Step 2: Test Again
```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata
) VALUES (
  '358657105967694',
  'test',
  'warning',
  'Debug Test',
  'Testing with enhanced error logging',
  '{}'::jsonb
);
```

### Step 3: Check Logs for Full Error
Look for `[Gemini Client] API error response:` in the logs. This will show:
- The exact error message from Gemini
- The request structure that was sent
- Any validation errors

### Step 4: Share Error Details
Once you see the full error in logs, share it and I can provide a specific fix.

## Alternative: Use Lovable Fallback

If Gemini API continues to fail, the system will automatically fall back to Lovable AI Gateway (if `LOVABLE_API_KEY` is set). This ensures the system continues working while we debug the Gemini issue.

## Quick Check: Is API Key Set?

Run this in Supabase SQL Editor to check if the secret exists (won't show value, just confirms it's there):

```sql
-- This won't work directly, but you can check in Dashboard:
-- Edge Functions → Secrets → Should see GEMINI_API_KEY
```

Or check the logs for:
- `[Gemini Client] Using Lovable AI Gateway (fallback)` = API key NOT set
- `[Gemini Client] Calling Gemini API directly` = API key IS set
