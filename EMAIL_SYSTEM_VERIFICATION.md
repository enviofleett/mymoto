# Email System Configuration Verification

## ✅ Current Setup Status

The email system is **already configured** to use the existing Gmail secrets from Supabase Edge Function secrets.

### Environment Variables Used:
- `GMAIL_USER` - Gmail account email
- `GMAIL_APP_PASSWORD` - Gmail app password
- `PUBLIC_APP_URL` - App URL (defaults to `https://app.fleethub.com`)

### How It Works:

1. **Email Service Utility** (`supabase/functions/send-alert-email/email-service.ts`)
   - Uses `Deno.env.get("GMAIL_USER")` and `Deno.env.get("GMAIL_APP_PASSWORD")`
   - Automatically reads from Supabase Edge Function secrets
   - No code changes needed

2. **Provider Approval Email** (`supabase/functions/send-provider-approval-email/index.ts`)
   - ✅ Already imports `getEmailConfig` from email service
   - ✅ Already uses `sendEmail` function
   - ✅ Checks for email config before sending

3. **Admin Register Provider** (`supabase/functions/admin-register-provider/index.ts`)
   - ✅ Calls `send-provider-approval-email` function when auto-approving
   - ✅ Passes password if auto-generated

## 🔍 Verification Steps

### 1. Check if Secrets are Set in Supabase:

**Via Supabase Dashboard:**
1. Go to: **Project Settings** → **Edge Functions** → **Secrets**
2. Verify these secrets exist:
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`
   - `PUBLIC_APP_URL` (optional, has default)

**Via CLI:**
```bash
supabase secrets list
```

### 2. Test Email Function:

**Option A: Test via Supabase Dashboard**
1. Go to: **Edge Functions** → **send-provider-approval-email** → **Invoke**
2. Use this test payload:
```json
{
  "providerId": "test-provider-id",
  "providerEmail": "test@example.com",
  "businessName": "Test Business",
  "password": "test123456"
}
```

**Option B: Test via Code**
- Register a test provider
- Approve it as admin
- Check email inbox (and spam folder)

### 3. Check Function Logs:

**Via Supabase Dashboard:**
1. Go to: **Edge Functions** → **send-provider-approval-email** → **Logs**
2. Look for:
   - ✅ "Sending approval email to provider: {email}"
   - ✅ "Approval email sent successfully to {email}"
   - ❌ "Missing Gmail credentials" (means secrets not set)

## 📧 Email Flow

### When Provider is Approved:

1. **Admin clicks "Approve"** in AdminDirectory.tsx
2. **Database update** sets `approval_status = 'approved'`
3. **Trigger fires** (`provider_approval_trigger`) assigns `service_provider` role
4. **Frontend calls** `send-provider-approval-email` function
5. **Function reads** Gmail secrets from environment
6. **Email sent** via Gmail SMTP
7. **Provider receives** approval email with login credentials

### When Admin Registers Provider with Auto-Approve:

1. **Admin fills form** and checks "Auto-approve"
2. **Edge function** `admin-register-provider` creates user + provider
3. **If auto-approve:** Function calls `send-provider-approval-email`
4. **Email sent** with auto-generated password (if applicable)

## 🛠️ Troubleshooting

### Issue: "Missing Gmail credentials" error

**Solution:**
1. Verify secrets are set in Supabase Dashboard
2. Check secret names are exactly: `GMAIL_USER` and `GMAIL_APP_PASSWORD`
3. Ensure secrets are set for the correct project
4. Redeploy edge functions after setting secrets

### Issue: Emails not received

**Check:**
1. ✅ Secrets are set correctly
2. ✅ Gmail app password is valid (not regular password)
3. ✅ Check spam/junk folder
4. ✅ Verify email address is correct
5. ✅ Check edge function logs for errors

### Issue: "Email service not configured" error

**Solution:**
- This means `getEmailConfig()` returned `null`
- Verify `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set
- Check function logs for specific error

## ✅ Confirmation Checklist

- [ ] `GMAIL_USER` secret is set in Supabase
- [ ] `GMAIL_APP_PASSWORD` secret is set in Supabase
- [ ] `PUBLIC_APP_URL` is set (or using default)
- [ ] Edge functions can access secrets (test via logs)
- [ ] Test email was sent and received
- [ ] Approval emails are working
- [ ] Auto-approve emails are working

## 📝 Code References

**Email Service:**
- `supabase/functions/send-alert-email/email-service.ts` (lines 25-34)

**Provider Approval Email:**
- `supabase/functions/send-provider-approval-email/index.ts` (line 23)

**Admin Registration:**
- `supabase/functions/admin-register-provider/index.ts` (lines 125-135)

**Frontend Approval:**
- `src/pages/AdminDirectory.tsx` (lines 375-381)

---

**Status:** ✅ Email system is correctly configured to use existing Gmail secrets. No code changes needed. Just verify secrets are set in Supabase Dashboard.
