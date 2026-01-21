# Email System Production Audit Report

## Executive Summary

This audit covers the entire email system in the admin dashboard and identifies critical issues, security vulnerabilities, and production readiness concerns. **Several critical issues require immediate attention before production deployment.**

---

## 🔴 CRITICAL ISSUES (Fix Before Production)

### 1. **Code Duplication - Multiple Email Service Implementations**
**Severity: HIGH**  
**Impact: Maintenance nightmare, inconsistent behavior, security risks**

**Problem:**
- Email service code is duplicated across 5+ files:
  - `supabase/functions/send-email/index.ts` (inlined)
  - `supabase/functions/_shared/email-service.ts` (shared)
  - `supabase/functions/send-alert-email/email-service.ts` (duplicate)
  - `supabase/functions/send-welcome-email/email-service.ts` (duplicate)
  - `supabase/functions/send-trip-summary-email/email-service.ts` (duplicate)

**Issues:**
- Security fixes must be applied to 5+ files
- Template updates require changes in multiple places
- Inconsistent error handling
- Different versions of the same code

**Fix:**
```typescript
// Use ONLY the shared email service
// All functions should import from: supabase/functions/_shared/email-service.ts
```

**Action Items:**
1. ✅ Keep `_shared/email-service.ts` as the single source of truth
2. ❌ Remove all duplicate email-service.ts files
3. ❌ Update all Edge Functions to import from `_shared/email-service.ts`
4. ❌ Remove inlined email code from `send-email/index.ts`

---

### 2. **Missing Email Validation & Sanitization**
**Severity: CRITICAL**  
**Impact: Email injection, spam, security vulnerabilities**

**Problem:**
- No email address validation before sending
- No sanitization of HTML content
- No validation of sender ID format
- Template variables not sanitized (XSS risk)

**Current Code:**
```typescript
// ❌ No validation
await sendEmail({
  to: testEmailAddress, // Could be malicious
  subject: processedSubject, // Could contain XSS
  html: wrappedHtml, // Could contain malicious HTML
});
```

**Fix:**
```typescript
// Add email validation
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Sanitize HTML (use DOMPurify or similar)
import { sanitize } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

function sanitizeHtml(html: string): string {
  // Remove script tags, dangerous attributes, etc.
  return sanitize(html, { ALLOWED_TAGS: ['p', 'div', 'a', 'strong', 'em', 'br'] });
}

// Validate sender ID format
function validateSenderId(senderId: string | null): boolean {
  if (!senderId) return true;
  const pattern = /^[^<>\s]+(\s*<[^\s@]+@[^\s@]+\.[^\s@]+>)?$/;
  return pattern.test(senderId);
}
```

**Action Items:**
1. Add email validation to all send functions
2. Sanitize HTML content before sending
3. Validate sender ID format
4. Escape template variables to prevent XSS

---

### 3. **No Rate Limiting on send-email Function**
**Severity: HIGH**  
**Impact: Email abuse, Gmail account suspension, cost overruns**

**Problem:**
- `send-email` function has NO rate limiting
- Admin can send unlimited test emails
- No protection against abuse
- Gmail has daily sending limits (~500/day for free accounts)

**Current State:**
- `send-alert-email` has rate limiting ✅
- `send-email` has NO rate limiting ❌

**Fix:**
```typescript
// Add rate limiting to send-email function
const MAX_EMAILS_PER_MINUTE = 5;
const MAX_EMAILS_PER_HOUR = 50;
const MAX_EMAILS_PER_DAY = 200;

// Track in database or use in-memory cache with TTL
const emailRateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { allowed: boolean; resetAt?: number } {
  const now = Date.now();
  const key = `email:${userId}`;
  const limit = emailRateLimiter.get(key);
  
  if (!limit || now > limit.resetAt) {
    emailRateLimiter.set(key, { count: 1, resetAt: now + 60000 });
    return { allowed: true };
  }
  
  if (limit.count >= MAX_EMAILS_PER_MINUTE) {
    return { allowed: false, resetAt: limit.resetAt };
  }
  
  limit.count++;
  return { allowed: true };
}
```

**Action Items:**
1. Implement rate limiting in `send-email` function
2. Add database table for persistent rate limiting
3. Return clear error messages when rate limit exceeded
4. Log rate limit violations for monitoring

---

### 4. **Missing Error Logging & Monitoring**
**Severity: HIGH**  
**Impact: Silent failures, no visibility into email issues**

**Problem:**
- Errors only logged to console (not persisted)
- No email delivery tracking
- No failure notifications
- No metrics/monitoring

**Fix:**
```typescript
// Create email_logs table
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_key TEXT,
  status TEXT NOT NULL, -- 'sent', 'failed', 'rate_limited'
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  user_id UUID REFERENCES auth.users(id)
);

// Log all email attempts
async function logEmailAttempt(
  recipient: string,
  subject: string,
  templateKey: string,
  status: 'sent' | 'failed' | 'rate_limited',
  errorMessage?: string,
  userId?: string
) {
  await supabase.from('email_logs').insert({
    recipient,
    subject,
    template_key: templateKey,
    status,
    error_message: errorMessage,
    user_id: userId,
  });
}
```

**Action Items:**
1. Create `email_logs` table
2. Log all email attempts (success and failure)
3. Add monitoring dashboard for email metrics
4. Set up alerts for high failure rates

---

### 5. **Insecure Sender ID Handling**
**Severity: MEDIUM**  
**Impact: Email spoofing, reputation damage**

**Problem:**
- Sender ID can be set to any value
- No validation that sender owns the domain
- Could be used for email spoofing

**Current Code:**
```typescript
// ❌ No validation
const fromAddress = options.senderId || options.from || config.gmailUser;
```

**Fix:**
```typescript
// Validate sender ID
function validateAndFormatSenderId(senderId: string | null, defaultEmail: string): string {
  if (!senderId) return defaultEmail;
  
  // Only allow sender ID if it matches the configured Gmail domain
  const senderEmail = extractEmailFromSenderId(senderId);
  if (senderEmail && !senderEmail.endsWith(`@${getDomain(defaultEmail)}`)) {
    console.warn(`Invalid sender ID domain: ${senderEmail}, using default`);
    return defaultEmail;
  }
  
  return senderId;
}
```

**Action Items:**
1. Validate sender ID domain matches Gmail account
2. Restrict sender ID to admin-only feature
3. Add sender ID to email logs for audit trail

---

## 🟡 HIGH PRIORITY ISSUES

### 6. **No Email Queue System**
**Severity: MEDIUM**  
**Impact: Lost emails during failures, no retry mechanism**

**Problem:**
- Emails sent synchronously
- If SMTP fails, email is lost
- No retry mechanism
- No queue for high-volume sending

**Recommendation:**
- Implement email queue using Supabase database
- Add retry logic with exponential backoff
- Process queue with cron job or background worker

---

### 7. **Template Variable Replacement is Unsafe**
**Severity: MEDIUM**  
**Impact: XSS vulnerabilities, broken HTML**

**Problem:**
```typescript
// ❌ No escaping
result = result.replace(regex, String(value || ''));
```

**Fix:**
```typescript
// Escape HTML in template variables
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

result = result.replace(regex, escapeHtml(String(value || '')));
```

---

### 8. **Missing Database Template Integration**
**Severity: MEDIUM**  
**Impact: Admin template changes not used by all functions**

**Problem:**
- `send-email` function doesn't check database templates
- Only `sendVehicleAssignmentEmail` helper checks DB
- Other functions use hardcoded templates

**Fix:**
```typescript
// Add database template lookup to send-email function
async function getTemplateFromDb(templateKey: string): Promise<{ subject: string; html: string } | null> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('subject, html_content, is_active')
    .eq('template_key', templateKey)
    .eq('is_active', true)
    .single();
  
  if (error || !data) return null;
  return { subject: data.subject, html: data.html_content };
}
```

---

### 9. **Inconsistent CORS Handling**
**Severity: LOW**  
**Impact: Potential CORS errors in production**

**Problem:**
- `send-email` uses `"ok"` for OPTIONS
- `send-alert-email` uses `null` for OPTIONS
- Inconsistent CORS headers

**Fix:**
- Standardize all Edge Functions to use same CORS pattern
- Use shared CORS utility

---

### 10. **No Email Bounce/Complaint Handling**
**Severity: LOW**  
**Impact: Reputation damage, no feedback loop**

**Problem:**
- No handling of bounced emails
- No unsubscribe mechanism
- No complaint handling

**Recommendation:**
- Set up Gmail webhook for bounces
- Add unsubscribe link to all emails
- Track bounce rates

---

## 🟢 MEDIUM PRIORITY IMPROVEMENTS

### 11. **Missing Email Preview in Admin Dashboard**
**Status: ✅ IMPLEMENTED**  
The preview feature exists but could be improved:
- Add mobile preview
- Add dark mode preview
- Test with real email clients

---

### 12. **No Email Template Versioning**
**Severity: LOW**  
**Impact: Can't rollback template changes**

**Recommendation:**
- Add version history to email_templates table
- Track who changed what and when

---

### 13. **Hardcoded Email Templates in Code**
**Severity: LOW**  
**Impact: Requires code deployment to change templates**

**Current State:**
- Database templates exist ✅
- But fallback to hardcoded templates in code
- Should use database as primary source

---

## 📋 PRODUCTION READINESS CHECKLIST

### Security
- [ ] ❌ Email validation implemented
- [ ] ❌ HTML sanitization implemented
- [ ] ❌ Sender ID validation implemented
- [ ] ❌ Rate limiting implemented
- [ ] ❌ XSS prevention in templates
- [x] ✅ Admin authentication required
- [x] ✅ CORS properly configured

### Reliability
- [ ] ❌ Email queue system
- [ ] ❌ Retry mechanism
- [ ] ❌ Error logging to database
- [ ] ❌ Email delivery tracking
- [x] ✅ Error handling in functions
- [ ] ❌ Monitoring/alerting

### Performance
- [ ] ❌ Rate limiting
- [ ] ❌ Batch sending for multiple recipients
- [ ] ❌ Async email sending
- [x] ✅ Deduplication in send-alert-email

### Maintainability
- [ ] ❌ Remove code duplication
- [ ] ❌ Use shared email service
- [ ] ❌ Database template integration
- [x] ✅ Template preview feature
- [ ] ❌ Template versioning

---

## 🔧 RECOMMENDED FIXES (Priority Order)

### Phase 1: Critical Security (Before Production)
1. **Add email validation** - Prevent injection attacks
2. **Sanitize HTML content** - Prevent XSS
3. **Implement rate limiting** - Prevent abuse
4. **Add error logging** - Track failures

### Phase 2: Code Quality (Week 1)
5. **Remove code duplication** - Use shared email service
6. **Database template integration** - Use DB templates everywhere
7. **Escape template variables** - Prevent XSS

### Phase 3: Production Hardening (Week 2)
8. **Email queue system** - Handle failures gracefully
9. **Email delivery tracking** - Monitor success rates
10. **Bounce handling** - Manage reputation

---

## 📝 CODE EXAMPLES FOR FIXES

### Example 1: Email Validation
```typescript
function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  if (email.length > 254) {
    return { valid: false, error: 'Email too long' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  // Check for dangerous patterns
  if (email.includes('<') || email.includes('>') || email.includes('\n')) {
    return { valid: false, error: 'Email contains invalid characters' };
  }
  
  return { valid: true };
}
```

### Example 2: Rate Limiting
```typescript
// Use Supabase database for persistent rate limiting
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; resetAt?: Date }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60000);
  
  // Count emails sent in last minute
  const { count, error } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', oneMinuteAgo.toISOString())
    .eq('status', 'sent');
  
  if (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true }; // Fail open
  }
  
  if (count && count >= MAX_EMAILS_PER_MINUTE) {
    const resetAt = new Date(now.getTime() + 60000);
    return { allowed: false, resetAt };
  }
  
  return { allowed: true };
}
```

### Example 3: HTML Sanitization
```typescript
// Simple HTML sanitizer (or use a library)
function sanitizeHtml(html: string): string {
  // Remove script tags
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers
  html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: URLs
  html = html.replace(/javascript:/gi, '');
  
  // Remove data: URLs (can contain scripts)
  html = html.replace(/data:text\/html/gi, '');
  
  return html;
}
```

---

## 🎯 SUMMARY

**Critical Issues Found: 4**  
**High Priority Issues: 5**  
**Medium Priority Issues: 4**

**Production Readiness: ❌ NOT READY**

The email system has several critical security and reliability issues that must be addressed before production deployment. The most urgent fixes are:
1. Email validation and sanitization
2. Rate limiting
3. Error logging
4. Code deduplication

**Estimated Time to Production Ready: 2-3 weeks**

---

## 📚 REFERENCES

- Gmail Sending Limits: https://support.google.com/a/answer/166852
- Email Security Best Practices: OWASP Email Security
- HTML Sanitization: DOMPurify, sanitize-html
- Rate Limiting Patterns: Token bucket, Sliding window
