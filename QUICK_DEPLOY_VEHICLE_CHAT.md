# Quick Deploy Guide - Vehicle Chat Fixes

## 🚀 3-Step Deployment

### Step 1: Login to Supabase
```bash
supabase login
```

### Step 2: Link Project (if needed)
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### Step 3: Deploy Function
```bash
supabase functions deploy vehicle-chat
```

---

## ✅ That's It!

The fixes are now deployed. Test by:
1. Opening the chat in your app
2. Sending a message
3. Verifying it saves to the database

---

## 🔍 Verify It Works

Run this SQL query to check recent messages:
```sql
SELECT device_id, role, content, created_at 
FROM vehicle_chat_history 
ORDER BY created_at DESC 
LIMIT 5;
```

---

**Note:** Don't try to run the TypeScript file as SQL - it's an edge function that needs to be deployed!
