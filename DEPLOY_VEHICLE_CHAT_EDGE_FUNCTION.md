# Deploy Vehicle Chat Edge Function

## 🚀 Deployment Methods

### Method 1: Supabase CLI (Recommended)

**Prerequisites:**
- Supabase CLI installed (`npm install -g supabase`)
- Logged in to Supabase (`supabase login`)
- Linked to your project (`supabase link --project-ref cmvpnsqiefbsqkwnraka`)

**Deploy Command:**
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy vehicle-chat
```

**Full deployment with all dependencies:**
```bash
# Make sure you're in the project root
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Deploy the function
supabase functions deploy vehicle-chat

# Verify deployment
supabase functions list
```

---

### Method 2: Supabase Dashboard (Alternative)

**Steps:**

1. **Go to Supabase Dashboard:**
   - Navigate to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
   - Or: Project → Edge Functions → `vehicle-chat`

2. **Upload the function:**
   - Click "Edit Function" or "Deploy"
   - Copy the entire contents of `supabase/functions/vehicle-chat/index.ts`
   - Paste into the editor
   - Click "Deploy" or "Save"

3. **Important Notes:**
   - ⚠️ Dashboard deployment may not automatically bundle shared modules
   - If you get module errors, you may need to inline shared code
   - CLI deployment is recommended for complex functions with dependencies

---

## 📁 Files to Deploy

The `vehicle-chat` function uses these files:

### Main Function:
- `supabase/functions/vehicle-chat/index.ts` ✅ **REQUIRED**

### Dependencies (automatically bundled by CLI):
- `supabase/functions/vehicle-chat/conversation-manager.ts`
- `supabase/functions/vehicle-chat/query-router.ts`
- `supabase/functions/vehicle-chat/command-parser.ts`
- `supabase/functions/vehicle-chat/date-extractor.ts`
- `supabase/functions/vehicle-chat/intent-classifier.ts`
- `supabase/functions/vehicle-chat/preference-learner.ts`
- `supabase/functions/vehicle-chat/spell-checker.ts`
- `supabase/functions/_shared/embedding-generator.ts`
- `supabase/functions/_shared/gemini-client.ts`

---

## 🔧 Environment Variables

Make sure these are set in Supabase Dashboard:

1. **Go to:** Project Settings → Edge Functions → Secrets

2. **Required Secrets:**
   - `MAPBOX_ACCESS_TOKEN` - For reverse geocoding addresses
   - `GEMINI_API_KEY` - For AI responses (optional, has fallback)

3. **Set them:**
   ```bash
   # Via CLI
   supabase secrets set MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
   supabase secrets set GEMINI_API_KEY=your_gemini_key_here
   ```

   Or via Dashboard:
   - Project Settings → Edge Functions → Secrets
   - Add each secret with its value

---

## ✅ Verification

After deployment, test the function:

1. **Check function logs:**
   ```bash
   supabase functions logs vehicle-chat
   ```

2. **Test via API:**
   ```bash
   curl -X POST https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/vehicle-chat \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "device_id": "YOUR_DEVICE_ID",
       "message": "Show me my trips yesterday",
       "user_id": "YOUR_USER_ID"
     }'
   ```

3. **Test in the app:**
   - Open the vehicle chat
   - Ask: "Show me my trips yesterday"
   - Should see a formatted table with addresses

---

## 🐛 Troubleshooting

### Error: "Module not found"
- **Solution:** Use CLI deployment (it bundles dependencies automatically)
- Or inline shared modules if using Dashboard

### Error: "MAPBOX_ACCESS_TOKEN not found"
- **Solution:** Set the secret in Supabase Dashboard or via CLI

### Error: "Rate limit exceeded"
- **Solution:** The function includes rate limiting (100ms delays)
- If still issues, increase delays in `formatTripsAsTable` function

### Function not updating
- **Solution:** Clear browser cache, wait 1-2 minutes for CDN propagation
- Check function version in Dashboard

---

## 📝 Quick Deploy Script

Create a file `deploy-vehicle-chat.sh`:

```bash
#!/bin/bash
echo "🚀 Deploying vehicle-chat edge function..."
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy vehicle-chat
echo "✅ Deployment complete!"
echo "📊 Check logs: supabase functions logs vehicle-chat"
```

Make it executable:
```bash
chmod +x deploy-vehicle-chat.sh
./deploy-vehicle-chat.sh
```

---

## 🎯 What Was Changed

The following features were added to `vehicle-chat`:

1. **Trip Table Formatting:**
   - `reverseGeocode()` function for address lookup
   - `formatTripsAsTable()` function for table generation
   - Automatic detection of trip history queries

2. **System Prompt Updates:**
   - Instructions for AI to use `[TRIP_TABLE:]` tags
   - Enhanced response rules for trip queries

3. **Frontend Integration:**
   - `TripTable` component in `VehicleChat.tsx`
   - Markdown table parsing and rendering

---

## ✨ Next Steps

After deployment:

1. **Test the feature:**
   - Ask: "Show me my trips yesterday"
   - Ask: "Where did I go last week?"
   - Ask: "Display my trip history for Monday"

2. **Monitor logs:**
   ```bash
   supabase functions logs vehicle-chat --tail
   ```

3. **Check for errors:**
   - Look for Mapbox API errors
   - Check for rate limiting issues
   - Verify address geocoding is working

---

**Ready to deploy!** 🚀
