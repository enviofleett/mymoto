# Deploy Vehicle Chat Fixes

## ⚠️ Important: Don't Run TypeScript as SQL!

The file `supabase/functions/vehicle-chat/index.ts` is a **TypeScript edge function**, not SQL. You cannot run it in the Supabase SQL Editor.

---

## ✅ Correct Deployment Steps

### Step 1: Deploy Edge Function

**Option A: Using Supabase CLI (Recommended)**

```bash
# 1. Make sure you're logged in
supabase login

# 2. Link to your project (if not already linked)
supabase link --project-ref your-project-ref

# 3. Deploy the vehicle-chat function
supabase functions deploy vehicle-chat
```

**Option B: Using Supabase Dashboard**

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions** → **vehicle-chat**
3. Click **Deploy** or **Update**
4. Upload the `supabase/functions/vehicle-chat/index.ts` file

---

### Step 2: Verify Deployment

After deployment, test the function:

```bash
# Test the function
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/vehicle-chat \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device",
    "user_id": "test-user-id",
    "message": "Hello"
  }'
```

Or test from your frontend by sending a chat message.

---

## 🔍 What Was Fixed

### Fix #1: Chat Messages Not Saving
- ✅ Added fallback save logic (tries with embeddings, then without)
- ✅ Error propagation to frontend
- ✅ Frontend verification

### Fix #2: Language Switching Issues
- ✅ Strict language validation
- ✅ Enhanced logging
- ✅ Prevents automatic language changes

---

## 📝 SQL Queries (For Database Checks Only)

If you want to **check the database** (not deploy), use these SQL queries:

### Check if embedding column exists:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vehicle_chat_history' 
AND column_name = 'embedding';
```

### Check recent chat messages:
```sql
SELECT device_id, role, content, created_at 
FROM vehicle_chat_history 
ORDER BY created_at DESC 
LIMIT 20;
```

### Check language preferences:
```sql
SELECT device_id, language_preference, updated_at 
FROM vehicle_llm_settings 
ORDER BY updated_at DESC;
```

---

## 🚨 Common Mistakes

❌ **DON'T:** Copy-paste `vehicle-chat/index.ts` into SQL Editor  
✅ **DO:** Deploy it as an edge function

❌ **DON'T:** Run TypeScript code as SQL  
✅ **DO:** Use SQL queries to check database state

---

## 📊 After Deployment

1. **Test chat message saving:**
   - Send a message in the chat
   - Check database: `SELECT * FROM vehicle_chat_history ORDER BY created_at DESC LIMIT 2;`
   - Verify both user and assistant messages are saved

2. **Test language consistency:**
   - Set language to English
   - Send 3-4 messages
   - Verify all responses are in English
   - Check logs for any language switch warnings

3. **Monitor edge function logs:**
   - Go to Supabase Dashboard → Edge Functions → vehicle-chat → Logs
   - Look for "Chat history saved successfully" messages
   - Check for any "LANGUAGE VALIDATION" warnings

---

## 🆘 Troubleshooting

### If deployment fails:
- Check you're logged in: `supabase login`
- Verify project link: `supabase projects list`
- Check function exists: `supabase functions list`

### If messages still don't save:
- Check edge function logs for errors
- Verify embedding column exists (use SQL query above)
- Check RLS policies allow inserts

### If language still switches:
- Check logs for "[LANGUAGE VALIDATION]" warnings
- Verify language preference in database
- Check frontend language selection component

---

**Remember:** Edge functions are TypeScript, not SQL. Deploy them, don't run them as SQL queries!
