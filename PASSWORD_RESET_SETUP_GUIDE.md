# Password Reset Setup Guide

This guide explains how to set up password reset functionality with custom email templates in Supabase.

## Overview

The password reset feature includes:
- **Forgot Password Page** (`/forgot-password`) - Users can request a password reset
- **Reset Password Page** (`/reset-password`) - Users can set a new password after clicking the email link
- **Email Templates** - Custom HTML and plain text templates for password reset emails

## Frontend Implementation

### Pages Created:
1. **`src/pages/ForgotPassword.tsx`** - Request password reset
2. **`src/pages/ResetPassword.tsx`** - Set new password
3. **`src/pages/Auth.tsx`** - Updated with "Forgot password?" link

### Routes Added:
- `/forgot-password` - Password reset request page
- `/reset-password` - Password reset confirmation page

### AuthContext Updates:
- Added `resetPassword(email)` function
- Added `updatePassword(newPassword)` function

## Supabase Email Template Configuration

### Step 1: Access Email Templates in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Find the **"Reset Password"** template

### Step 2: Configure the Email Template

#### Option A: Use HTML Template (Recommended)

1. Copy the contents of `supabase/templates/password-reset-email.html`
2. Paste it into the **HTML** field in the Supabase dashboard
3. The template uses these variables:
   - `{{ .ConfirmationURL }}` - The password reset link
   - `{{ .SiteURL }}` - Your site URL (configured in project settings)

#### Option B: Use Plain Text Template

1. Copy the contents of `supabase/templates/password-reset-email.txt`
2. Paste it into the **Plain Text** field in the Supabase dashboard

### Step 3: Configure Site URL

1. Go to **Project Settings** → **Authentication**
2. Set **Site URL** to your production URL (e.g., `https://yourdomain.com`)
3. Add your domain to **Redirect URLs**:
   - `https://yourdomain.com/reset-password`
   - `https://yourdomain.com/auth`

### Step 4: Configure Email Provider (If Not Already Done)

Supabase uses its default email service, but you can configure a custom SMTP provider:

1. Go to **Project Settings** → **Auth** → **SMTP Settings**
2. Configure your SMTP provider (Gmail, SendGrid, etc.)
3. Test the email delivery

## Email Template Variables

The email template supports these Supabase variables:

- `{{ .ConfirmationURL }}` - The password reset link with token
- `{{ .SiteURL }}` - Your configured site URL
- `{{ .Email }}` - User's email address
- `{{ .Token }}` - The reset token (usually not needed)

## Testing Password Reset

### Test Flow:

1. **Request Reset:**
   - Navigate to `/forgot-password`
   - Enter a valid email address
   - Click "Send Reset Link"
   - Check email inbox

2. **Reset Password:**
   - Click the reset link in the email
   - Should redirect to `/reset-password?access_token=...&type=recovery`
   - Enter new password and confirm
   - Should redirect to `/auth` after success

### Troubleshooting:

**Email not received:**
- Check spam/junk folder
- Verify email provider is configured correctly
- Check Supabase logs for email delivery errors
- Ensure email address exists in your Supabase auth users

**Reset link not working:**
- Verify redirect URL is configured in Supabase settings
- Check that the link hasn't expired (1 hour default)
- Ensure the route `/reset-password` is accessible

**Password update fails:**
- Verify the access token is valid
- Check browser console for errors
- Ensure password meets minimum requirements (6+ characters)

## Security Considerations

1. **Link Expiration:** Password reset links expire after 1 hour (configurable in Supabase)
2. **Rate Limiting:** Supabase automatically rate limits password reset requests
3. **Token Security:** Tokens are single-use and expire after use
4. **HTTPS Required:** Always use HTTPS in production for secure token transmission

## Customization

### Styling:
- Edit `supabase/templates/password-reset-email.html` to customize colors, fonts, and layout
- The template uses a dark theme matching the MyMoto app design
- Orange accent color (`#ff6b35`) matches the app's accent color

### Content:
- Modify the text in the HTML template to match your brand voice
- Update footer links and branding as needed

## Production Checklist

- [ ] Email template configured in Supabase dashboard
- [ ] Site URL configured correctly
- [ ] Redirect URLs added to allowed list
- [ ] SMTP provider configured (if using custom provider)
- [ ] Test password reset flow end-to-end
- [ ] Verify email delivery in production
- [ ] Check mobile responsiveness of email template
- [ ] Test with different email providers (Gmail, Outlook, etc.)

## Support

If you encounter issues:
1. Check Supabase logs: **Dashboard** → **Logs** → **Auth Logs**
2. Verify email template syntax is correct
3. Test with a different email address
4. Check browser console for frontend errors
