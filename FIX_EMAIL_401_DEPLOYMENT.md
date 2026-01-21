# Fix Email 401 Unauthorized Error

## Problem

You're getting a `401 Unauthorized` error when trying to send test emails. This is happening because:

1. **The Edge Function hasn't been deployed** with the latest authentication changes
2. **The Authorization header** may not be included automatically by the Supabase client

## ✅ Fixes Applied

### 1. Frontend Fix
Updated `src/pages/AdminEmailTemplates.tsx` to explicitly pass the Authorization header:

```typescript
// Get session first
const { data: { session } } = await supabase.auth.getSession();

// Pass auth token explicitly
const { data, error } = await supabase.functions.invoke('send-email', {
  body: { ... },
  headers: {
    Authorization: `Bearer ${session.access_token}`,
  },
});
```

### 2. Config Fix
Added `send-email` to `supabase/config.toml` with `verify_jwt = false` (we handle auth manually in the function).

## 🚀 Deployment Required

**The Edge Function MUST be deployed** for these fixes to work:

### Option 1: Deploy via Supabase Dashboard (Easiest)

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Find `send-email` function (or create it if it doesn't exist)
3. Click "Edit" or open the editor
4. Copy the entire contents of `supabase/functions/send-email/index.ts`
5. Paste into the editor
6. Click "Deploy" or "Save"

### Option 2: Deploy via CLI

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy send-email
```

## ✅ Verification Steps

After deploying:

1. **Check you're logged in:**
   - Make sure you're logged in to the app
   - Verify you have admin role

2. **Test the function:**
   - Go to Admin Email Templates page
   - Click "Send Test Email"
   - Enter a test email address
   - Click "Send Test Email"

3. **Check function logs:**
   - Go to Supabase Dashboard → Edge Functions → send-email → Logs
   - Look for any errors or authentication issues

## 🔍 Troubleshooting

### Still getting 401?

1. **Check session:**
   ```typescript
   // In browser console
   const { data: { session } } = await supabase.auth.getSession();
   console.log('Session:', session);
   ```
   - If `session` is null, you need to log in
   - If `session.access_token` is missing, refresh the page

2. **Check admin role:**
   ```sql
   SELECT * FROM user_roles 
   WHERE user_id = '<your-user-id>' AND role = 'admin';
   ```
   - If no rows, add admin role:
   ```sql
   INSERT INTO user_roles (user_id, role) 
   VALUES ('<your-user-id>', 'admin');
   ```

3. **Check function logs:**
   - Go to Supabase Dashboard → Edge Functions → send-email → Logs
   - Look for error messages
   - Check if auth header is being received

### Getting 403 Forbidden?

This means:
- ✅ Authentication is working (401 → 403 is progress!)
- ❌ Your user doesn't have admin role

**Fix:** Add admin role to your user (see SQL above)

### Function not found / 404?

The function hasn't been deployed yet. Follow deployment steps above.

## 📝 Quick Test

After deployment, test with curl:

```bash
# Get your access token from browser console:
# const { data: { session } } = await supabase.auth.getSession();
# console.log(session.access_token);

curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/send-email' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "template": "welcome",
    "to": "test@example.com",
    "data": {
      "userName": "Test User"
    }
  }'
```

Should return:
```json
{
  "success": true,
  "message": "Email sent successfully to 1 recipient(s)",
  "recipients": 1
}
```

## ✅ Success Indicators

After successful deployment:
- ✅ No more 401 errors
- ✅ Test emails send successfully
- ✅ Email logs appear in `email_logs` table
- ✅ Rate limiting works (try sending 6 emails quickly)
