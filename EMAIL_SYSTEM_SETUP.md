# Email System Setup Guide

## Overview
The email system uses Gmail SMTP to send automated emails for various system events. It includes a template system for consistent, professional email formatting.

## Features
- ✅ Gmail SMTP integration
- ✅ Email templates for all use cases
- ✅ Email configuration UI in Settings page
- ✅ Test email functionality
- ✅ Rate limiting and deduplication

## Setup Instructions

### 1. Generate Gmail App Password

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification** (must be enabled)
3. Scroll down to **App passwords**
4. Select **Mail** and **Other (Custom name)**
5. Enter "MyMoto Fleet" as the name
6. Click **Generate**
7. Copy the 16-character app password (you'll need this)

### 2. Configure Supabase Secrets

1. Go to your Supabase Dashboard
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Add the following secrets:
   - `GMAIL_USER`: Your Gmail address (e.g., `your-email@gmail.com`)
   - `GMAIL_APP_PASSWORD`: The 16-character app password from step 1

### 3. Configure Email Settings in UI

1. Log in as an admin user
2. Go to **Settings** → **Email Settings** tab
3. Enter your Gmail address and app password
4. Enter a test email address
5. Click **Save Configuration**
6. Click **Send Test Email** to verify it works

## Available Email Templates

### 1. Alert Email
Used for vehicle alerts and notifications.

**Template:** `alert`
**Required Data:**
- `severity`: 'info' | 'warning' | 'error' | 'critical'
- `title`: string
- `message`: string
- `vehicleName`: string (optional)
- `timestamp`: string (optional)
- `metadata`: object (optional)

### 2. Password Reset Email
Used for password reset links.

**Template:** `passwordReset`
**Required Data:**
- `resetLink`: string
- `userName`: string (optional)
- `expiresIn`: string (optional)

### 3. Welcome Email
Used for new user welcome messages.

**Template:** `welcome`
**Required Data:**
- `userName`: string
- `loginLink`: string (optional)

### 4. Trip Summary Email
Used for daily/weekly trip summaries.

**Template:** `tripSummary`
**Required Data:**
- `userName`: string
- `vehicleName`: string
- `date`: string
- `distance`: string
- `duration`: string
- `startLocation`: string (optional)
- `endLocation`: string (optional)
- `maxSpeed`: string (optional)
- `avgSpeed`: string (optional)

### 5. System Notification Email
Used for general system notifications.

**Template:** `systemNotification`
**Required Data:**
- `title`: string
- `message`: string
- `actionLink`: string (optional)
- `actionText`: string (optional)

## Usage Examples

### Sending an Alert Email
```typescript
await supabase.functions.invoke('send-email', {
  body: {
    template: 'alert',
    to: 'admin@example.com',
    data: {
      severity: 'critical',
      title: 'Low Battery Alert',
      message: 'Vehicle battery is below 20%',
      vehicleName: 'Vehicle 001',
      timestamp: new Date().toLocaleString(),
    }
  }
});
```

### Sending a Password Reset Email
```typescript
await supabase.functions.invoke('send-email', {
  body: {
    template: 'passwordReset',
    to: 'user@example.com',
    data: {
      resetLink: 'https://yourapp.com/reset?token=abc123',
      userName: 'John Doe',
      expiresIn: '1 hour',
    }
  }
});
```

## Edge Functions

### `send-email`
Generic email sending function that uses templates.

**Endpoint:** `/functions/v1/send-email`
**Method:** POST
**Body:**
```json
{
  "template": "alert" | "passwordReset" | "welcome" | "tripSummary" | "systemNotification",
  "to": "email@example.com" | ["email1@example.com", "email2@example.com"],
  "data": { /* template-specific data */ },
  "customSubject": "optional custom subject",
  "customHtml": "optional custom HTML"
}
```

### `send-alert-email`
Legacy alert email function (now uses new template system internally).

**Endpoint:** `/functions/v1/send-alert-email`
**Method:** POST
**Body:**
```json
{
  "eventId": "uuid",
  "deviceId": "device_id",
  "eventType": "low_battery",
  "severity": "critical",
  "title": "Alert Title",
  "message": "Alert message",
  "metadata": {}
}
```

## Troubleshooting

### Email Not Sending
1. Check that Gmail credentials are set in Supabase secrets
2. Verify 2-Step Verification is enabled on Gmail account
3. Ensure app password is correct (16 characters, no spaces)
4. Check Edge Function logs in Supabase Dashboard

### Test Email Fails
1. Verify Gmail address and app password in Settings
2. Check that test email address is valid
3. Check browser console for errors
4. Verify Edge Function is deployed

### Rate Limiting
- Maximum 3 emails per minute per function instance
- Duplicate alerts are automatically deduplicated (1 minute cooldown)

## Security Notes

- Gmail app passwords are stored in Supabase secrets (encrypted)
- Never commit app passwords to version control
- App passwords can be revoked in Google Account settings
- Email addresses are validated before sending
