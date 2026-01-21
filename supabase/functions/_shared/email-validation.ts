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
