# Fix: Gemini API 400 Error

## Issue
The edge function logs show recurring `LLM API error: 400` errors when calling Gemini API directly.

## Root Cause
The Gemini API request format may be incorrect, or the model name might not be available.

## Fix Applied

### 1. Changed Default Model
- **Before:** `gemini-2.0-flash-exp` (experimental, may not be available)
- **After:** `gemini-1.5-flash` (stable, widely available)

### 2. Added Retry Logic
- If 400 error occurs with `systemInstruction` format, retry with system prompt in `contents`
- Better error logging to see actual API error details

### 3. Improved Error Handling
- Logs full error response from Gemini API
- Shows request body structure (sanitized)
- Better debugging information

## Next Steps

### Step 1: Redeploy Functions
```bash
cd supabase/functions
supabase functions deploy proactive-alarm-to-chat
```

### Step 2: Verify API Key
1. Go to Supabase Dashboard → Edge Functions → Secrets
2. Verify `GEMINI_API_KEY` is set correctly
3. Key should start with `AIza...`

### Step 3: Test Again
Run the test alarm:
```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata
) VALUES (
  '358657105967694',
  'test',
  'warning',
  'Gemini Fix Test',
  'Testing after 400 error fix',
  '{}'::jsonb
);
```

### Step 4: Check Logs
Look for:
- ✅ `[Gemini Client] Successfully received response` = Working!
- ❌ `[Gemini Client] API error: 400` = Still failing (check error details)
- ⚠️ `[Gemini Client] Using Lovable AI Gateway (fallback)` = GEMINI_API_KEY not set

## Common 400 Error Causes

1. **Invalid API Key**
   - Solution: Verify key in Google AI Studio
   - Check: https://aistudio.google.com/app/apikey

2. **Model Not Available**
   - Solution: Use `gemini-1.5-flash` (stable)
   - Check: https://ai.google.dev/models/gemini

3. **Request Format Issue**
   - Solution: Code now includes retry with alternative format
   - Check: Edge function logs for detailed error

4. **API Quota Exceeded**
   - Solution: Check Google Cloud Console
   - Check: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com

## Verification

After redeploying, check the logs for:
```
[Gemini Client] Calling Gemini API directly
[Gemini Client] Successfully received response
```

If you still see 400 errors, the logs will now show the exact error message from Gemini API, which will help diagnose the issue.
