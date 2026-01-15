# Test Instructions: Gemini API Integration

## Quick Test (2 minutes)

### Step 1: Insert Test Alarm
Run this in Supabase SQL Editor:

```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata
) VALUES (
  '358657105967694',
  'test',
  'warning',
  'Gemini API Test - ' || to_char(now(), 'HH24:MI:SS'),
  'Testing Gemini API integration',
  '{}'::jsonb
);
```

### Step 2: Wait 10-15 seconds
Give the webhook and edge function time to process.

### Step 3: Check Chat Message
Run this query:

```sql
SELECT content, role, is_proactive, created_at 
FROM vehicle_chat_history 
WHERE device_id = '358657105967694' 
  AND is_proactive = true 
  AND created_at > now() - interval '2 minutes'
ORDER BY created_at DESC 
LIMIT 1;
```

### Step 4: Check Edge Function Logs
1. Go to: **Supabase Dashboard → Edge Functions → `proactive-alarm-to-chat` → Logs**
2. Look for these messages:

**✅ Success:**
- `[Gemini Client] Calling Gemini API directly { model: 'gemini-1.5-flash', apiVersion: 'v1' }`
- `[Gemini Client] Successfully received response`
- `[proactive-alarm-to-chat] Successfully posted proactive message`

**⚠️ Fallback (OK):**
- `[Gemini Client] Model not found in v1, trying v1beta with gemini-pro...`
- `[Gemini Client] Fallback to gemini-pro successful`

**❌ Error:**
- `[Gemini Client] API error response` (check error details)

## What to Look For

### ✅ Success Indicators:
1. **Chat message created** - Query returns a row
2. **Natural message** - Not just "Test - Gemini: Testing..." (that's fallback)
3. **Personality-based** - Message sounds like the vehicle speaking
4. **Has emoji** - Should start with ⚡ (for warning)
5. **First person** - Uses "I'm...", "My..." etc.

### ⚠️ Fallback Indicators:
- Message format: "⚡ Title: Message" (simple format)
- Logs show: `[Gemini Client] Using Lovable AI Gateway (fallback)`
- This means `GEMINI_API_KEY` is not set

### ❌ Error Indicators:
- No chat message created
- Logs show API errors
- Check error details in logs

## Expected Message Examples

### ✅ Good (LLM-generated):
- "⚡ Hey! My battery's getting low - down to 15%. Might want to charge me soon!"
- "⚡ I'm parked at [location]. Everything looks good here!"
- "⚡ Quick heads up: I detected some unusual movement. Just wanted to let you know!"

### ⚠️ Fallback (still works, but not AI-generated):
- "⚡ Gemini API Test - 21:16:44: Testing Gemini API integration"

## Troubleshooting

### No message created?
1. Check webhook: **Database → Webhooks → alarm-to-chat-webhook → Recent deliveries**
2. Check logs: **Edge Functions → proactive-alarm-to-chat → Logs**
3. Verify vehicle exists: `SELECT * FROM vehicles WHERE device_id = '358657105967694';`

### Message is fallback format?
1. Check if `GEMINI_API_KEY` is set: **Edge Functions → Secrets**
2. Check logs for API errors
3. Verify API key is valid in [Google AI Studio](https://aistudio.google.com/app/apikey)

### API errors in logs?
1. Share the error message from logs
2. Check if API key has correct permissions
3. Verify billing is enabled in Google Cloud Console

## Full Test Script

For a comprehensive test with detailed analysis, use:
- `TEST_GEMINI_API_INTEGRATION.sql` - Complete test with quality checks
