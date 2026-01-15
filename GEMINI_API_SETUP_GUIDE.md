# Gemini API Setup Guide for Production

This guide explains how to set up Google Gemini API across all edge functions for production use.

## Overview

All edge functions have been updated to use a **shared Gemini API client** (`_shared/gemini-client.ts`) that:
- ✅ Uses **direct Gemini API** when `GEMINI_API_KEY` is configured
- ✅ Falls back to **Lovable AI Gateway** if `GEMINI_API_KEY` is not set
- ✅ Supports both **streaming** and **non-streaming** responses
- ✅ Handles errors gracefully with proper fallbacks

## Updated Edge Functions

The following functions now use the shared Gemini client:

1. **`proactive-alarm-to-chat`** - Generates proactive chat messages from alarms
2. **`vehicle-chat`** - Main AI vehicle companion (with streaming)
3. **`conversation-manager`** - Conversation summarization
4. **`fleet-insights`** - Fleet health insights generation
5. **`analyze-completed-trip`** - Trip analysis and driver scoring

## Setup Steps

### Step 1: Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Copy the API key (starts with `AIza...`)

### Step 2: Add API Key to Supabase

1. Open your **Supabase Dashboard**
2. Navigate to **Edge Functions** → **Secrets**
3. Click **"Add Secret"**
4. Enter:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** Your Gemini API key (e.g., `AIzaSy...`)
5. Click **"Save"**

### Step 3: Deploy Updated Functions

After adding the secret, redeploy all updated functions:

#### Option A: Deploy All Functions (Recommended)

```bash
# From project root
cd supabase/functions

# Deploy each function
supabase functions deploy proactive-alarm-to-chat
supabase functions deploy vehicle-chat
supabase functions deploy fleet-insights
supabase functions deploy analyze-completed-trip
```

#### Option B: Deploy via Supabase Dashboard

1. Go to **Edge Functions** in Supabase Dashboard
2. For each function:
   - Click on the function name
   - Click **"Deploy"** or **"Redeploy"**

### Step 4: Verify Setup

#### Test Proactive Alarm

```sql
-- Insert a test alarm
INSERT INTO proactive_vehicle_events (
  device_id, 
  event_type, 
  severity, 
  title, 
  message, 
  metadata
)
VALUES (
  'YOUR_DEVICE_ID',
  'test',
  'warning',
  'Battery Low',
  'Battery level is at 15%',
  '{}'::jsonb
);

-- Check if chat message was created
SELECT * FROM vehicle_chat_history 
WHERE device_id = 'YOUR_DEVICE_ID' 
  AND is_proactive = true 
ORDER BY created_at DESC 
LIMIT 1;
```

#### Test Vehicle Chat

1. Open your PWA
2. Navigate to a vehicle chat
3. Send a message (e.g., "Where is my car?")
4. Verify you receive a streaming response

#### Check Edge Function Logs

1. Go to **Edge Functions** → **Logs** in Supabase Dashboard
2. Look for logs like:
   - `[Gemini Client] Calling Gemini API directly` (if using direct API)
   - `[Gemini Client] Using Lovable AI Gateway (fallback)` (if fallback)

## Configuration

### Model Selection

The shared client uses these models by default:
- **Non-streaming:** `gemini-2.0-flash-exp`
- **Streaming:** `gemini-2.0-flash-exp`

To change the model, update the `model` parameter in each function's `callGeminiAPI` or `callGeminiAPIStream` call.

### Available Models

- `gemini-2.0-flash-exp` - Latest experimental (recommended)
- `gemini-1.5-flash` - Stable version
- `gemini-1.5-pro` - More capable (slower, more expensive)

### Temperature & Token Limits

Each function has optimized settings:
- **Proactive alarms:** `maxOutputTokens: 150, temperature: 0.7`
- **Vehicle chat:** `maxOutputTokens: 2048, temperature: 0.7`
- **Conversation summaries:** `maxOutputTokens: 150, temperature: 0.3`
- **Fleet insights:** `maxOutputTokens: 200, temperature: 0.7`
- **Trip analysis:** `maxOutputTokens: 150, temperature: 0.5`

## Fallback Behavior

If `GEMINI_API_KEY` is **not set**, the system automatically falls back to **Lovable AI Gateway** using `LOVABLE_API_KEY`. This ensures:
- ✅ No breaking changes
- ✅ Gradual migration path
- ✅ Zero downtime

## Troubleshooting

### Error: "Either GEMINI_API_KEY or LOVABLE_API_KEY must be configured"

**Solution:** Add at least one API key to Supabase Edge Functions secrets.

### Error: "Gemini API error: 400"

**Possible causes:**
- Invalid API key
- API key doesn't have access to the model
- Request format issue

**Solution:**
1. Verify API key in [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Check Edge Function logs for detailed error message
3. Ensure the model name is correct

### Error: "Gemini API error: 429"

**Solution:** You've hit the rate limit. The system will automatically retry with exponential backoff.

### Streaming Not Working

**Solution:**
1. Check Edge Function logs for streaming errors
2. Verify the function is using `callGeminiAPIStream` (not `callGeminiAPI`)
3. Ensure the frontend is properly handling SSE (Server-Sent Events)

## Cost Considerations

### Gemini API Pricing (as of 2024)

- **Gemini 2.0 Flash:** ~$0.075 per 1M input tokens, ~$0.30 per 1M output tokens
- **Gemini 1.5 Flash:** ~$0.075 per 1M input tokens, ~$0.30 per 1M output tokens
- **Gemini 1.5 Pro:** ~$1.25 per 1M input tokens, ~$5.00 per 1M output tokens

### Estimated Monthly Costs

For a fleet of 100 vehicles with:
- 10 proactive alarms/day/vehicle = 1,000 alarms/day
- 50 chat messages/day/vehicle = 5,000 messages/day
- Average 100 tokens per request

**Monthly estimate:** ~$15-30/month (using Gemini 2.0 Flash)

## Migration Checklist

- [ ] Get Gemini API key from Google AI Studio
- [ ] Add `GEMINI_API_KEY` to Supabase Edge Functions secrets
- [ ] Deploy all updated edge functions
- [ ] Test proactive alarm flow
- [ ] Test vehicle chat (streaming)
- [ ] Test fleet insights
- [ ] Monitor Edge Function logs for errors
- [ ] Verify costs in Google Cloud Console
- [ ] (Optional) Remove `LOVABLE_API_KEY` after confirming Gemini works

## Support

If you encounter issues:
1. Check Edge Function logs in Supabase Dashboard
2. Verify API key is correctly set in secrets
3. Test with a simple function first (e.g., `proactive-alarm-to-chat`)
4. Review Google Gemini API documentation: https://ai.google.dev/docs

---

**Last Updated:** January 14, 2025
