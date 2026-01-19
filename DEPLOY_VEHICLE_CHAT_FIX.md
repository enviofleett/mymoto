# Deploy Vehicle Chat Fix - Conversation Summary Length Limit

## 🚀 Quick Deploy via Supabase CLI (Recommended)

### Step 1: Login to Supabase CLI
```bash
supabase login
```

### Step 2: Deploy the Function
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy vehicle-chat
```

That's it! The fix is now deployed.

---

## 🌐 Alternative: Deploy via Supabase Dashboard

If you don't have CLI access:

### Step 1: Go to Edge Functions
1. Open: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Find: **vehicle-chat** function
3. Click: **Edit** or **Open**

### Step 2: Update the Code
The fix is already in your local file: `supabase/functions/vehicle-chat/conversation-manager.ts`

**What changed:**
- Added conversation text length limit (5000 chars)
- Prevents 400 API errors from requests that are too long
- Better error logging

**You can either:**
1. **Let GitHub auto-deploy** (if you have GitHub integration enabled)
   - Just commit and push:
   ```bash
   git add supabase/functions/vehicle-chat/conversation-manager.ts
   git commit -m "Fix: Add conversation length limit to prevent 400 errors"
   git push
   ```

2. **Or manually copy** the updated `conversation-manager.ts` file content into the Dashboard editor

---

## ✅ Verify Deployment

After deployment, test it:
1. Send a message in the vehicle chat
2. Check the edge function logs for any "Summary API error: 400" messages
3. The errors should now be reduced or eliminated

---

## 📝 What This Fix Does

**Before:**
- Long conversations could cause 400 errors when summarizing
- Error was non-blocking but noisy in logs

**After:**
- Conversation text is truncated to 5000 characters
- Most recent messages are kept (better context)
- 400 errors should be prevented
- Better error logging for debugging

---

## 🆘 Troubleshooting

**Error: "Access token not provided"**
- Run `supabase login` first

**Error: "Project not linked"**
- Run `supabase link --project-ref cmvpnsqiefbsqkwnraka`

**Want to deploy via GitHub?**
- Make sure GitHub integration is enabled in Supabase Dashboard
- Push your code → auto-deploys
