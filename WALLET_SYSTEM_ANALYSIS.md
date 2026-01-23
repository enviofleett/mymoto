# Wallet System Analysis: What's Working & What's Broken

## 🎯 System Overview

The wallet system is a **prepaid billing system** for LLM-enabled vehicle features. Users top up their wallet, and the system automatically charges daily fees for vehicles with AI chat enabled.

---

## ✅ What's Working

### 1. Database Schema ✅
- **`wallets` table** - One wallet per user with balance tracking
- **`wallet_transactions` table** - Complete transaction ledger (credits/debits)
- **`billing_config` table** - Stores daily rate (₦500/day) and new user bonus
- **`vehicle_llm_settings` table** - Tracks which vehicles have LLM enabled
- **Auto-creation trigger** - Wallets created automatically when users sign up
- **RLS policies** - Users can only see their own wallet, admins see all

### 2. Frontend Components ✅
- **Wallet Display** (`WalletCard.tsx`) - Shows balance, currency, top-up button
- **Transaction History** (`TransactionHistory.tsx`) - Lists all credits/debits
- **Top-Up Dialog** (`TopUpDialog.tsx`) - Payment amount selection with quick amounts
- **Admin Wallet Management** (`AdminWallets.tsx`) - View all wallets, manual adjustments
- **Billing Config** (`BillingConfigCard.tsx`) - Admin can set daily rate

### 3. Payment Flow (Paystack) ✅
- **Initialize Payment** - Creates Paystack transaction
- **Payment Verification** - Verifies payment after user returns
- **Webhook Handler** - Processes Paystack webhooks for automatic crediting
- **Deduplication** - Prevents double-crediting same transaction
- **Auto Re-enable LLM** - Re-enables LLM when user tops up after negative balance

### 4. Admin Features ✅
- **View All Wallets** - See all user wallets with balances
- **Manual Adjustments** - Credit/debit wallets manually
- **Transaction Stats** - Total revenue, credits, debits
- **New User Bonus** - Configurable welcome bonus

---

## ⚠️ What's Broken / Missing

### 1. Billing Cron Job ❌ **NOT SCHEDULED**
**Problem:** The `billing-cron` Edge Function exists but is **NOT scheduled to run automatically**.

**Impact:**
- Users are NOT being charged daily for LLM-enabled vehicles
- Wallets are NOT being debited automatically
- LLM is NOT being disabled when balance goes negative
- System is essentially free right now

**Fix Required:**
```sql
-- Need to create a cron job to run billing-cron daily at midnight
SELECT cron.schedule(
  'daily-llm-billing',
  '0 0 * * *', -- Every day at midnight UTC
  $$
  SELECT
    net.http_post(
      url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/billing-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

### 2. Paystack Edge Function ❌ **MAY NOT BE DEPLOYED**
**Problem:** The `paystack` function may not be deployed to Supabase.

**Impact:**
- Top-up button will fail
- Payment initialization won't work
- Webhooks won't be processed

**Fix Required:**
```bash
supabase functions deploy paystack
```

**Environment Variables Needed:**
- `PAYSTACK_SECRET_KEY` - Must be set in Supabase Dashboard → Edge Functions → paystack → Settings

### 3. Webhook URL Configuration ❌ **NOT CONFIGURED**
**Problem:** Paystack webhook URL not configured in Paystack dashboard.

**Impact:**
- Payments may succeed but wallet won't be credited automatically
- Manual verification required

**Fix Required:**
1. Go to Paystack Dashboard → Settings → Webhooks
2. Add webhook URL: `https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/paystack?action=webhook`
3. Enable events: `charge.success`

### 4. Balance Update Race Condition ⚠️ **POTENTIAL ISSUE**
**Problem:** In `paystack/index.ts`, wallet balance is updated BEFORE transaction record is created.

**Impact:**
- If transaction insert fails, balance is updated but no record exists
- Data inconsistency

**Current Code (Line 70-92):**
```typescript
// Updates balance first
const newBalance = parseFloat(wallet.balance) + amountNgn;
await supabase.from("wallets").update({ balance: newBalance })...

// Then creates transaction (if this fails, balance is already updated!)
await supabase.from("wallet_transactions").insert({...});
```

**Better Approach:** Use database transaction or update balance AFTER transaction record is created.

### 5. Negative Balance Prevention ⚠️ **PARTIAL**
**Problem:** 
- Admin can debit below zero (no check in `useAdminWallets.ts`)
- Billing cron allows negative balance (disables LLM but doesn't prevent it)

**Impact:**
- Wallets can go negative
- Users might be confused by negative balances

**Fix:** Add balance check before debiting in admin panel.

### 6. Missing Error Handling ⚠️
**Problem:** Some error cases not handled gracefully:
- Paystack API failures
- Network timeouts
- Invalid payment references

**Impact:**
- Users see generic errors
- Payment failures not clearly communicated

---

## 📊 System Flow

### Top-Up Flow (User)
```
1. User clicks "Top Up" → TopUpDialog opens
2. User selects amount → initiateTopUp() called
3. Frontend calls paystack function (action=initialize)
4. Paystack function creates transaction → returns authorization_url
5. User redirected to Paystack checkout
6. User completes payment → Paystack redirects back with reference
7. Frontend calls verifyPayment() → paystack function (action=verify)
8. Paystack function verifies payment → credits wallet
9. Wallet balance updated → Transaction record created
10. If balance was negative → LLM re-enabled for user's vehicles
```

### Daily Billing Flow (Automated - CURRENTLY BROKEN)
```
1. Cron job triggers billing-cron function (SHOULD run daily at midnight)
2. Function gets daily rate from billing_config
3. Finds all vehicles with llm_enabled = true
4. Groups by user_id (owner)
5. For each user:
   - Calculates total charge (daily_rate × number of vehicles)
   - Debits wallet balance
   - Creates transaction records (one per vehicle)
   - Updates last_billing_date
   - If balance < 0 → Disables LLM for all user's vehicles
```

### Admin Manual Adjustment Flow
```
1. Admin views wallet in AdminWallets page
2. Clicks "Credit" or "Debit" button
3. Enters amount and description
4. adjustWallet() called
5. Balance updated → Transaction record created
6. UI refreshes
```

---

## 🔧 Required Fixes

### Priority 1: Critical (System Not Functional)
1. **Deploy Paystack Function**
   ```bash
   supabase functions deploy paystack
   ```

2. **Set Environment Variables**
   - `PAYSTACK_SECRET_KEY` in Supabase Dashboard

3. **Configure Paystack Webhook**
   - Add webhook URL in Paystack Dashboard

4. **Schedule Billing Cron**
   - Create cron job to run `billing-cron` daily

### Priority 2: Important (Data Integrity)
5. **Fix Race Condition**
   - Use database transaction for balance + transaction updates
   - Or update balance AFTER transaction record is created

6. **Prevent Negative Balances**
   - Add check in admin debit function
   - Show warning before allowing negative balance

### Priority 3: Nice to Have (UX)
7. **Better Error Messages**
   - Specific error messages for payment failures
   - Retry mechanisms for network errors

8. **Payment Status Tracking**
   - Show pending payments
   - Handle payment cancellations

---

## 🧪 Testing Checklist

### Wallet Creation
- [ ] New user signup creates wallet automatically
- [ ] Wallet balance starts at 0 (or new user bonus if configured)

### Top-Up Flow
- [ ] Top-up dialog opens correctly
- [ ] Payment initialization works
- [ ] Paystack redirect works
- [ ] Payment verification works
- [ ] Wallet balance updates after payment
- [ ] Transaction appears in history

### Daily Billing
- [ ] Cron job runs daily (check logs)
- [ ] Users with LLM-enabled vehicles are charged
- [ ] Transaction records are created
- [ ] LLM is disabled when balance goes negative
- [ ] LLM is re-enabled when user tops up

### Admin Features
- [ ] Admin can view all wallets
- [ ] Admin can credit wallets
- [ ] Admin can debit wallets (with balance check)
- [ ] Admin can update daily rate
- [ ] Admin can update new user bonus

---

## 📝 Current Status Summary

| Component | Status | Notes |
|----------|--------|-------|
| Database Schema | ✅ Working | All tables exist, RLS configured |
| Frontend UI | ✅ Working | All components render correctly |
| Wallet Display | ✅ Working | Shows balance, transactions |
| Top-Up Flow | ⚠️ Partial | Function may not be deployed |
| Payment Processing | ❌ Broken | Paystack function needs deployment + webhook config |
| Daily Billing | ❌ Broken | Cron job not scheduled |
| Admin Features | ✅ Working | Can view and adjust wallets |
| Auto Wallet Creation | ✅ Working | Trigger creates wallet on signup |

---

## 🚀 Quick Fix Commands

```bash
# 1. Deploy Paystack function
supabase functions deploy paystack

# 2. Set environment variable (in Supabase Dashboard)
# PAYSTACK_SECRET_KEY = your_paystack_secret_key

# 3. Schedule billing cron (run in SQL Editor)
# See SQL above in "Billing Cron Job" section

# 4. Configure Paystack webhook
# URL: https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/paystack?action=webhook
```

---

## 💡 Recommendations

1. **Immediate:** Deploy paystack function and configure webhook
2. **Immediate:** Schedule billing cron job
3. **Soon:** Fix race condition in payment processing
4. **Soon:** Add negative balance prevention
5. **Later:** Add payment status tracking and better error handling
