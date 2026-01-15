# Quick Deploy: Gemini API Setup

## Step 1: Get API Key
1. Visit: https://aistudio.google.com/app/apikey
2. Click "Get API Key" or "Create API Key"
3. Copy the key (starts with `AIza...`)

## Step 2: Add to Supabase
1. Supabase Dashboard → **Edge Functions** → **Secrets**
2. Click **"Add Secret"**
3. Name: `GEMINI_API_KEY`
4. Value: Your API key
5. Click **"Save"**

## Step 3: Deploy Functions

### Via CLI (Recommended)
```bash
cd supabase/functions
supabase functions deploy proactive-alarm-to-chat
supabase functions deploy vehicle-chat
supabase functions deploy fleet-insights
supabase functions deploy analyze-completed-trip
```

### Via Dashboard
1. Go to **Edge Functions** in Supabase Dashboard
2. For each function, click **"Redeploy"**

## Step 4: Test

### Test Alarm
```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata
) VALUES (
  '358657105967694', 'test', 'warning', 'Test Gemini', 'Testing direct Gemini API', '{}'::jsonb
);
```

### Check Result
```sql
SELECT * FROM vehicle_chat_history 
WHERE device_id = '358657105967694' 
  AND is_proactive = true 
ORDER BY created_at DESC 
LIMIT 1;
```

## What Changed?

✅ All 5 edge functions now use **direct Gemini API**
✅ Automatic fallback to Lovable AI if `GEMINI_API_KEY` not set
✅ Zero breaking changes - works with or without Gemini key

## Need Help?

See `GEMINI_API_SETUP_GUIDE.md` for detailed documentation.
