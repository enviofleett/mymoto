# Admin Wallet Features Implementation

## Overview
This document describes the implementation of admin wallet management features including:
1. Admin-controlled new user bonus
2. Admin wallet top-up with email notifications
3. Email templates for wallet operations

---

## Features Implemented

### 1. Admin New User Bonus Control ✅
**Location:** `src/pages/AdminWallets.tsx`

**Features:**
- Admin can set the welcome bonus amount for new users
- Bonus is automatically applied when new users register
- Email notification sent to new users when bonus is applied

**How it works:**
1. Admin sets bonus amount in Admin Wallets page
2. Amount is stored in `billing_config` table with key `new_user_bonus`
3. When a new user registers, `handle_new_user_wallet()` trigger function:
   - Creates wallet with bonus amount
   - Creates transaction record if bonus > 0
   - Sends welcome email via trigger (if configured)

**Edge Function:** `supabase/functions/admin-update-bonus/index.ts`
- Validates admin access
- Updates `billing_config` table
- Returns success/error response

---

### 2. Admin Wallet Top-Up with Email ✅
**Location:** `src/pages/AdminWallets.tsx` + `supabase/functions/admin-wallet-topup/index.ts`

**Features:**
- Admin can credit any user's wallet
- Automatic email notification to user
- Transaction record created
- Balance updated atomically

**How it works:**
1. Admin clicks "Credit" button on a wallet
2. Enters amount and optional description
3. Frontend calls `admin-wallet-topup` Edge Function
4. Edge Function:
   - Validates admin access
   - Updates wallet balance
   - Creates transaction record
   - Sends email notification to user
   - Returns success response

**Email Template:** `EmailTemplates.walletTopUp()`
- Shows amount credited
- Shows new balance
- Includes description and admin name
- Link to view wallet

---

### 3. Email Templates ✅

#### Wallet Top-Up Email
**Template:** `EmailTemplates.walletTopUp()`
**Location:** `supabase/functions/_shared/email-service.ts`

**Content:**
- Greeting with user name
- Amount credited (highlighted in green)
- New balance
- Description/reason
- Admin name who processed it
- Link to view wallet
- Professional styling

#### New User Bonus Email
**Template:** `EmailTemplates.newUserBonusNotification()`
**Location:** `supabase/functions/_shared/email-service.ts`

**Content:**
- Welcome message
- Bonus amount (highlighted in blue)
- Current balance
- Link to view wallet
- Thank you message

---

## Database Schema

### Tables Used
1. **`wallets`** - Stores user wallet balances
2. **`wallet_transactions`** - Transaction ledger
3. **`billing_config`** - Stores new user bonus amount
4. **`profiles`** - User profile information
5. **`user_roles`** - Admin role verification

### Triggers
1. **`on_auth_user_created_wallet`** - Creates wallet when user signs up
2. **`on_wallet_created_send_bonus_email`** - Sends email when wallet created with bonus (optional)

---

## Edge Functions

### 1. `admin-wallet-topup`
**Purpose:** Admin wallet credit with email notification

**Request:**
```json
{
  "wallet_id": "uuid",
  "amount": 5000,
  "description": "Bonus credit",
  "send_email": true
}
```

**Response:**
```json
{
  "success": true,
  "wallet_id": "uuid",
  "amount": 5000,
  "new_balance": 10000,
  "email_sent": true
}
```

**Authentication:** Requires admin role (JWT verified)

### 2. `admin-update-bonus`
**Purpose:** Update new user bonus amount

**Request:**
```json
{
  "amount": 1000
}
```

**Response:**
```json
{
  "success": true,
  "amount": 1000,
  "message": "New user bonus updated to ₦1,000"
}
```

**Authentication:** Requires admin role (JWT verified)

---

## Frontend Components

### AdminWallets Page
**File:** `src/pages/AdminWallets.tsx`

**Features:**
- View all user wallets
- Credit/Debit wallets
- Set new user bonus
- View transaction stats

**UI Enhancements:**
- Email notification indicator for credits
- Clear descriptions of what each action does
- Success/error toast notifications

### useAdminWallets Hook
**File:** `src/hooks/useAdminWallets.ts`

**Functions:**
- `fetchWallets()` - Get all wallets
- `fetchStats()` - Get transaction statistics
- `fetchNewUserBonus()` - Get current bonus amount
- `updateNewUserBonus(amount)` - Update bonus (calls Edge Function)
- `adjustWallet(walletId, amount, type, description, sendEmail)` - Credit/debit wallet

---

## Email Configuration

### Required Environment Variables
- `GMAIL_USER` - Gmail account for sending emails
- `GMAIL_APP_PASSWORD` - Gmail app password

### Email Service
**Location:** `supabase/functions/_shared/email-service.ts`

**Features:**
- Gmail SMTP integration
- HTML email templates
- Email validation
- Sanitization

---

## Deployment Steps

### 1. Deploy Edge Functions
```bash
# Deploy admin wallet top-up function
supabase functions deploy admin-wallet-topup

# Deploy admin update bonus function
supabase functions deploy admin-update-bonus
```

### 2. Configure Environment Variables
In Supabase Dashboard → Edge Functions → Settings:
- Set `GMAIL_USER` (if not already set)
- Set `GMAIL_APP_PASSWORD` (if not already set)

### 3. Run Database Migration (Optional)
If you want automatic email on new user bonus:
```sql
-- Run supabase/migrations/20260123000001_add_email_to_new_user_bonus.sql
-- Note: Requires pg_net extension
```

### 4. Update Config
The `supabase/config.toml` has been updated to include:
```toml
[functions.admin-wallet-topup]
verify_jwt = true

[functions.admin-update-bonus]
verify_jwt = true
```

---

## Testing Checklist

### New User Bonus
- [ ] Admin can set bonus amount
- [ ] Bonus is saved to database
- [ ] New user receives bonus on signup
- [ ] Transaction record created
- [ ] Email sent to new user (if trigger configured)

### Wallet Top-Up
- [ ] Admin can credit wallet
- [ ] Balance updates correctly
- [ ] Transaction record created
- [ ] Email sent to user
- [ ] Email contains correct information
- [ ] Non-admin users cannot access function

### Email Templates
- [ ] Top-up email renders correctly
- [ ] Bonus email renders correctly
- [ ] Links work correctly
- [ ] Styling is consistent
- [ ] Mobile-friendly

---

## Security Considerations

1. **Admin Verification:** Both Edge Functions verify admin role via `user_roles` table
2. **JWT Validation:** Functions require valid JWT token
3. **Input Validation:** Amounts validated (>= 0, numeric)
4. **Email Sanitization:** HTML content sanitized before sending
5. **Error Handling:** Errors logged but not exposed to client

---

## Future Enhancements

1. **Bulk Top-Up:** Credit multiple wallets at once
2. **Top-Up History:** View all admin top-ups
3. **Email Preferences:** Allow users to opt-out of emails
4. **SMS Notifications:** Add SMS for wallet updates
5. **Automated Bonuses:** Scheduled bonuses for special events

---

## Troubleshooting

### Emails Not Sending
1. Check `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set
2. Verify email service is configured in Edge Function
3. Check Edge Function logs for errors
4. Verify user email exists in database

### Bonus Not Applied
1. Check `billing_config` table has `new_user_bonus` entry
2. Verify trigger `on_auth_user_created_wallet` exists
3. Check trigger function `handle_new_user_wallet()` is correct

### Permission Errors
1. Verify user has admin role in `user_roles` table
2. Check JWT token is valid
3. Verify Edge Function `verify_jwt = true` in config

---

## Files Modified/Created

### Created
- `supabase/functions/admin-wallet-topup/index.ts`
- `supabase/functions/admin-update-bonus/index.ts`
- `supabase/migrations/20260123000001_add_email_to_new_user_bonus.sql`
- `ADMIN_WALLET_FEATURES_IMPLEMENTATION.md`

### Modified
- `supabase/functions/_shared/email-service.ts` - Added wallet email templates
- `src/hooks/useAdminWallets.ts` - Enhanced to use Edge Functions
- `src/pages/AdminWallets.tsx` - Added email notification indicators
- `supabase/config.toml` - Added Edge Function configs
