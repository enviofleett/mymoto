# Deploy Email System Fixes

## ✅ What's Been Fixed

All critical email system fixes have been implemented in code:

1. ✅ **Email Validation** - Created `_shared/email-validation.ts`
2. ✅ **Rate Limiting** - Created `_shared/email-rate-limit.ts`
3. ✅ **Email Logging** - Created migration `20260121000001_email_logs.sql`
4. ✅ **Email Service Updated** - Added validation and sanitization
5. ✅ **send-email Function Updated** - Added rate limiting and logging
6. ✅ **Frontend Updated** - Added HTML escaping in template preview

## 🚀 Deployment Steps

### Step 1: Run Database Migration

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/20260121000001_email_logs.sql`
3. Paste and run in SQL Editor
4. Verify table created: `SELECT * FROM email_logs LIMIT 1;`

### Step 2: Deploy Edge Functions

```bash
# Navigate to project root
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Deploy updated functions
supabase functions deploy send-email

# Verify deployment
supabase functions list
```

### Step 3: Remove Code Duplication (Optional but Recommended)

```bash
# Delete duplicate email-service.ts files
rm supabase/functions/send-alert-email/email-service.ts
rm supabase/functions/send-welcome-email/email-service.ts
rm supabase/functions/send-trip-summary-email/email-service.ts
```

Then update these files to import from shared:
- `supabase/functions/send-alert-email/index.ts`
- `supabase/functions/send-welcome-email/index.ts`
- `supabase/functions/send-trip-summary-email/index.ts`

Change:
```typescript
// FROM:
import { sendEmail, EmailTemplates, getEmailConfig } from "./email-service.ts";

// TO:
import { sendEmail, EmailTemplates, getEmailConfig } from "../_shared/email-service.ts";
```

### Step 4: Test

1. **Test Email Validation:**
   - Go to Admin Email Templates
   - Try sending test email to invalid address → Should fail
   - Try sending to valid address → Should work

2. **Test Rate Limiting:**
   - Send 5 test emails quickly → Should work
   - Send 6th email immediately → Should get rate limit error
   - Wait 1 minute → Should work again

3. **Verify Logging:**
   ```sql
   SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 10;
   ```

## 📋 Verification Checklist

- [ ] Migration `20260121000001_email_logs.sql` executed successfully
- [ ] `email_logs` table exists and is accessible
- [ ] Edge Function `send-email` deployed successfully
- [ ] Test email with valid address works
- [ ] Test email with invalid address fails with validation error
- [ ] Rate limiting works (6th email in 1 minute fails)
- [ ] Email logs are being created in database
- [ ] Admin can view email logs

## 🔍 Troubleshooting

### Error: "Table email_logs does not exist"
**Solution:** Run the migration SQL file in Supabase SQL Editor

### Error: "Rate limit check failed"
**Solution:** Check that `email_logs` table exists and RLS policies are correct

### Error: "Invalid email addresses"
**Solution:** This is expected - validation is working. Use a valid email format.

### Rate limiting not working
**Solution:** 
1. Check `email_logs` table exists
2. Verify RLS policy allows inserts
3. Check function logs: `supabase functions logs send-email`

## 📊 Monitoring

After deployment, monitor:

```sql
-- Check email success rate
SELECT 
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM email_logs
WHERE sent_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Check rate limit violations
SELECT COUNT(*) as rate_limited_count
FROM email_logs
WHERE status = 'rate_limited'
  AND sent_at > NOW() - INTERVAL '24 hours';

-- Check top users by email count
SELECT 
  u.email,
  COUNT(*) as email_count
FROM email_logs el
JOIN auth.users u ON el.user_id = u.id
WHERE el.sent_at > NOW() - INTERVAL '24 hours'
GROUP BY u.email
ORDER BY email_count DESC
LIMIT 10;
```

## ✅ Success Criteria

- ✅ Email validation rejects invalid addresses
- ✅ Rate limiting prevents abuse (5/min limit enforced)
- ✅ All email attempts are logged
- ✅ HTML sanitization removes dangerous content
- ✅ Admin can view email logs

## 🎯 Next Steps

After successful deployment:
1. Monitor email_logs table for patterns
2. Set up alerts for high failure rates
3. Review rate limit thresholds (adjust if needed)
4. Consider implementing email queue system (Phase 3)
