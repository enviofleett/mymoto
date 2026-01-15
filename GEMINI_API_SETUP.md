# Google Gemini API Direct Integration Setup

## Overview

The `proactive-alarm-to-chat` edge function now supports **direct Google Gemini API integration** as the primary method, with Lovable AI Gateway as a fallback.

## Benefits of Direct Gemini API

✅ **No intermediary service** - Direct connection to Google  
✅ **Lower latency** - Fewer hops  
✅ **Better error messages** - Direct from Google  
✅ **More control** - Full access to Gemini features  
✅ **Cost effective** - Direct pricing from Google  

## Step 1: Get Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Select or create a Google Cloud project
5. Copy the API key (starts with `AIza...`)

## Step 2: Add API Key to Edge Function Secrets

1. Go to **Supabase Dashboard** → **Edge Functions** → **Secrets**
2. Click **"Add a new secret"**
3. **Name:** `GEMINI_API_KEY`
4. **Value:** Paste your Gemini API key
5. Click **"Save"**

## Step 3: Verify Edge Function Code

The edge function automatically detects which API key is available:
- If `GEMINI_API_KEY` exists → Uses direct Gemini API
- If only `LOVABLE_API_KEY` exists → Uses Lovable AI Gateway (fallback)
- If neither exists → Throws error

## Step 4: Test the Integration

After adding the secret, test with:

```sql
INSERT INTO proactive_vehicle_events (
  device_id, 
  event_type, 
  severity, 
  title, 
  message, 
  metadata
)
VALUES (
  '358657105967694',
  'test',
  'warning',
  'Test Alarm - Gemini Direct',
  'Testing direct Gemini API integration',
  '{}'::jsonb
);
```

Check logs:
- Edge Functions → `proactive-alarm-to-chat` → Logs
- Should see: `[proactive-alarm-to-chat] Calling Gemini API directly`

## API Models Available

The function uses `gemini-2.0-flash-exp` by default. You can change it in the code:

**Available models:**
- `gemini-2.0-flash-exp` - Latest experimental (fast, recommended)
- `gemini-1.5-flash` - Stable version
- `gemini-1.5-pro` - More capable (slower, more expensive)

To change model, edit line in `proactive-alarm-to-chat/index.ts`:
```typescript
const model = 'gemini-1.5-flash'; // Change this
```

## Request Format

**Gemini API Format:**
```json
{
  "contents": [
    {
      "parts": [
        { "text": "user prompt here" }
      ]
    }
  ],
  "systemInstruction": {
    "parts": [
      { "text": "system prompt here" }
    ]
  },
  "generationConfig": {
    "maxOutputTokens": 150,
    "temperature": 0.7
  }
}
```

**Response Format:**
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "generated message here"
          }
        ]
      }
    }
  ]
}
```

## Error Handling

The function handles:
- ✅ API key missing → Clear error message
- ✅ API errors → Logs full error response
- ✅ Empty responses → Falls back to simple message
- ✅ Network errors → Falls back to simple message

## Cost Comparison

**Direct Gemini API:**
- Free tier: 15 requests/minute
- Paid: $0.075 per 1M input tokens, $0.30 per 1M output tokens
- Very affordable for proactive messages

**Lovable AI Gateway:**
- Uses credits/usage-based pricing
- May have additional overhead

## Troubleshooting

### "GEMINI_API_KEY not configured"
- Add the secret in Edge Functions → Secrets
- Make sure name is exactly: `GEMINI_API_KEY`

### "Gemini API error: 400"
- Check API key is valid
- Verify API key has access to Gemini API
- Check Google Cloud project billing is enabled

### "Gemini API error: 429"
- Rate limit exceeded
- Wait a few seconds and retry
- Consider upgrading API quota

### "Empty response from Gemini API"
- Check API key permissions
- Verify model name is correct
- Check Google Cloud project status

## Migration from Lovable AI

If you're currently using Lovable AI:
1. Add `GEMINI_API_KEY` secret
2. Function automatically switches to direct Gemini
3. Keep `LOVABLE_API_KEY` as backup (optional)
4. Test to verify it works
5. Remove `LOVABLE_API_KEY` if desired (after confirming Gemini works)

## Security Notes

- ✅ API key is stored as Supabase secret (encrypted)
- ✅ Never commit API key to code
- ✅ Use different keys for dev/prod if needed
- ✅ Rotate keys periodically

## Next Steps

1. Get Gemini API key from Google AI Studio
2. Add it to Edge Functions → Secrets
3. Redeploy the edge function (if needed)
4. Test with a sample alarm
5. Monitor logs for successful calls
