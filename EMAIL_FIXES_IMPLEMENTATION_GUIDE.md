# Email System Fixes - Implementation Guide

## ✅ Implementation Status

**Most fixes have been implemented!** See `EMAIL_FIXES_STATUS.md` for current status.

## Quick Start: Critical Fixes

This guide provides ready-to-use code for the most critical email system issues identified in the audit.

---

## Fix 1: Email Validation & Sanitization

### Step 1: Create Email Validation Utility

**File: `supabase/functions/_shared/email-validation.ts`**
```typescript
/**
 * Email validation and sanitization utilities
 */

export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  // Trim whitespace
  email = email.trim();
  
  // Check length
  if (email.length > 254) {
    return { valid: false, error: 'Email address too long (max 254 characters)' };
  }
  
  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  // Check for dangerous patterns (injection attempts)
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /data:text\/html/i,
    /\r|\n/,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(email)) {
      return { valid: false, error: 'Email contains invalid characters' };
    }
  }
  
  return { valid: true };
}

export function validateEmailList(emails: string | string[]): { valid: boolean; error?: string; validEmails?: string[] } {
  const emailArray = Array.isArray(emails) ? emails : [emails];
  const validEmails: string[] = [];
  
  for (const email of emailArray) {
    const validation = validateEmail(email);
    if (!validation.valid) {
      return { valid: false, error: `Invalid email: ${email} - ${validation.error}` };
    }
    validEmails.push(email.trim());
  }
  
  return { valid: true, validEmails };
}

export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  // Remove script tags and content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: URLs
  html = html.replace(/javascript:/gi, '');
  
  // Remove data: URLs that could contain scripts
  html = html.replace(/data:text\/html/gi, '');
  html = html.replace(/data:image\/svg\+xml/gi, '');
  
  // Remove iframe tags
  html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  
  // Remove object/embed tags
  html = html.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  html = html.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
  
  return html;
}

export function escapeHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) {
    return '';
  }
  
  const str = String(text);
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  
  return str.replace(/[&<>"']/g, m => map[m]);
}

export function validateSenderId(senderId: string | null | undefined): { valid: boolean; formatted?: string; error?: string } {
  if (!senderId) {
    return { valid: true };
  }
  
  // Format: "Name <email@domain.com>" or just "email@domain.com"
  const pattern = /^([^<>\n\r]+)?\s*(<[^\s@]+@[^\s@]+\.[^\s@]+>)?$/;
  
  if (!pattern.test(senderId)) {
    return { valid: false, error: 'Invalid sender ID format. Use: "Name <email@domain.com>" or "email@domain.com"' };
  }
  
  // Extract email if present
  const emailMatch = senderId.match(/<([^>]+)>/);
  if (emailMatch) {
    const email = emailMatch[1];
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return { valid: false, error: `Invalid email in sender ID: ${emailValidation.error}` };
    }
  }
  
  return { valid: true, formatted: senderId.trim() };
}
```

### Step 2: Update Email Service

**File: `supabase/functions/_shared/email-service.ts`** ✅ **ALREADY UPDATED**

The email service has been updated with:
- Email validation for recipients
- Sender ID validation
- HTML sanitization
- Subject escaping

The validation happens automatically when `sendEmail()` is called.

---

## Fix 2: Rate Limiting

### Step 1: Create Email Logs Table

**File: `supabase/migrations/20260121000001_email_logs.sql`**
```sql
-- Email logs for tracking and rate limiting
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'rate_limited', 'validation_failed')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  user_id UUID REFERENCES auth.users(id),
  sender_id TEXT
);

-- Indexes for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_email_logs_user_time ON public.email_logs(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON public.email_logs(sent_at DESC);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all logs
DROP POLICY IF EXISTS "Admins can view email logs" ON public.email_logs;
CREATE POLICY "Admins can view email logs"
ON public.email_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policy: System can insert logs (via service role)
DROP POLICY IF EXISTS "System can insert email logs" ON public.email_logs;
CREATE POLICY "System can insert email logs"
ON public.email_logs FOR INSERT
WITH CHECK (true); -- Service role bypasses RLS
```

### Step 2: Add Rate Limiting to Email Service

**File: `supabase/functions/_shared/email-rate-limit.ts`**
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_EMAILS_PER_MINUTE = 5;
const MAX_EMAILS_PER_HOUR = 50;
const MAX_EMAILS_PER_DAY = 200;

export async function checkRateLimit(
  userId: string,
  supabase: any
): Promise<{ allowed: boolean; resetAt?: Date; error?: string }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60000);
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const oneDayAgo = new Date(now.getTime() - 86400000);
  
  // Check per-minute limit
  const { count: minuteCount } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', oneMinuteAgo.toISOString())
    .eq('status', 'sent');
  
  if (minuteCount && minuteCount >= MAX_EMAILS_PER_MINUTE) {
    const resetAt = new Date(oneMinuteAgo.getTime() + 60000);
    return {
      allowed: false,
      resetAt,
      error: `Rate limit exceeded: ${MAX_EMAILS_PER_MINUTE} emails per minute. Try again in ${Math.ceil((resetAt.getTime() - now.getTime()) / 1000)} seconds.`
    };
  }
  
  // Check per-hour limit
  const { count: hourCount } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', oneHourAgo.toISOString())
    .eq('status', 'sent');
  
  if (hourCount && hourCount >= MAX_EMAILS_PER_HOUR) {
    const resetAt = new Date(oneHourAgo.getTime() + 3600000);
    return {
      allowed: false,
      resetAt,
      error: `Rate limit exceeded: ${MAX_EMAILS_PER_HOUR} emails per hour. Try again in ${Math.ceil((resetAt.getTime() - now.getTime()) / 3600000)} hours.`
    };
  }
  
  // Check per-day limit
  const { count: dayCount } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', oneDayAgo.toISOString())
    .eq('status', 'sent');
  
  if (dayCount && dayCount >= MAX_EMAILS_PER_DAY) {
    const resetAt = new Date(oneDayAgo.getTime() + 86400000);
    return {
      allowed: false,
      resetAt,
      error: `Rate limit exceeded: ${MAX_EMAILS_PER_DAY} emails per day. Try again tomorrow.`
    };
  }
  
  return { allowed: true };
}

export async function logEmailAttempt(
  recipient: string,
  subject: string,
  templateKey: string | null,
  status: 'sent' | 'failed' | 'rate_limited' | 'validation_failed',
  errorMessage: string | null,
  userId: string | null,
  senderId: string | null,
  supabase: any
): Promise<void> {
  try {
    await supabase.from('email_logs').insert({
      recipient,
      subject,
      template_key: templateKey,
      status,
      error_message: errorMessage,
      user_id: userId,
      sender_id: senderId,
    });
  } catch (error) {
    console.error('[Email Log] Failed to log email attempt:', error);
    // Don't throw - logging failure shouldn't break email sending
  }
}
```

### Step 3: Update send-email Function

**File: `supabase/functions/send-email/index.ts`** ✅ **ALREADY UPDATED**

The send-email function has been updated with:
- Rate limiting checks (5/min, 50/hour, 200/day)
- Email validation before sending
- Email logging for all attempts (sent, failed, rate_limited, validation_failed)
- Proper error handling with logging

All changes are integrated into the handler function.

---

## Fix 3: Template Variable Escaping

**Status: ⚠️ PARTIAL - Needs Frontend Update**

The email service now sanitizes HTML content automatically. However, template variable replacement in the frontend (`AdminEmailTemplates.tsx`) should also escape HTML.

**File: `src/pages/AdminEmailTemplates.tsx`** (update replaceTemplateVariables function)

```typescript
// Add escapeHtml function
function escapeHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  const str = String(text);
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, m => map[m]);
}

// Update replaceTemplateVariables to escape
function replaceTemplateVariables(template: string, data: Record<string, string>): string {
  let result = template;
  
  // Replace {{variable}} with escaped values
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    // Escape HTML in template variables
    result = result.replace(regex, escapeHtml(String(value || '')));
  }
  
  // Handle {{#if}} conditionals
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, variable, content) => {
    return data[variable] ? content : '';
  });
  
  // Remove any remaining template syntax
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  
  return result;
}
```

**Note:** The Edge Function already sanitizes HTML before sending, so this is an additional safety layer for the preview.

---

## Fix 4: Remove Code Duplication

### Action Items:

1. **Delete duplicate email-service.ts files:**
   ```bash
   rm supabase/functions/send-alert-email/email-service.ts
   rm supabase/functions/send-welcome-email/email-service.ts
   rm supabase/functions/send-trip-summary-email/email-service.ts
   ```

2. **Update all Edge Functions to import from shared:**
   ```typescript
   // In send-alert-email/index.ts
   import { sendEmail, EmailTemplates, getEmailConfig } from "../_shared/email-service.ts";
   
   // In send-welcome-email/index.ts
   import { sendEmail, EmailTemplates, getEmailConfig } from "../_shared/email-service.ts";
   
   // In send-trip-summary-email/index.ts
   import { sendEmail, EmailTemplates, getEmailConfig } from "../_shared/email-service.ts";
   ```

3. **Remove inlined code from send-email/index.ts:**
   - Remove the inlined email service code (lines 5-356)
   - Import from shared instead:
   ```typescript
   import { sendEmail, EmailTemplates, getEmailConfig } from "../_shared/email-service.ts";
   ```

---

## Deployment Checklist

### ✅ Completed
- [x] Created `_shared/email-validation.ts` with validation utilities
- [x] Created `_shared/email-rate-limit.ts` with rate limiting
- [x] Created migration: `20260121000001_email_logs.sql`
- [x] Updated `_shared/email-service.ts` with validation
- [x] Updated `send-email/index.ts` with rate limiting and logging

### ⚠️ Pending
- [ ] Run migration: `20260121000001_email_logs.sql` in Supabase
- [ ] Deploy updated Edge Functions to Supabase
- [ ] Remove duplicate email-service.ts files (see Fix 4)
- [ ] Update all Edge Functions to use shared service (see Fix 4)
- [ ] Update frontend template variable escaping (see Fix 3)
- [ ] Test email validation
- [ ] Test rate limiting
- [ ] Test HTML sanitization
- [ ] Verify email logs are being created

---

## Testing

### Test Email Validation
```typescript
// Should fail
validateEmail("test@example.com<script>"); // Invalid
validateEmail("test@"); // Invalid format
validateEmail("a".repeat(300) + "@example.com"); // Too long

// Should pass
validateEmail("test@example.com"); // Valid
```

### Test Rate Limiting
1. Send 5 emails in quick succession
2. 6th email should be rate limited
3. Wait 1 minute, should work again

### Test HTML Sanitization
```typescript
const malicious = '<script>alert("XSS")</script><p>Safe content</p>';
const sanitized = sanitizeHtml(malicious);
// Should be: '<p>Safe content</p>'
```

---

## Next Steps

After implementing these fixes:
1. Monitor email_logs table for patterns
2. Set up alerts for high failure rates
3. Implement email queue system (Phase 3)
4. Add bounce handling
5. Create email metrics dashboard
