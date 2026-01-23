# Fix Multiple Active Privacy Terms

## Problem

You have **6 active privacy terms** in the database, but only **1 should be active** at a time.

**Current Status:**
- 6 records with `is_active = true`
- All have version "1.0"
- Created at different times
- Latest: January 22, 2026

## Impact

- Frontend query uses `.maybeSingle()` which expects 0 or 1 row
- Multiple active terms can cause inconsistent behavior
- Users might see different terms depending on which one is returned

## Solution

### Step 1: Fix Database (Run SQL)

Run `FIX_MULTIPLE_ACTIVE_PRIVACY_TERMS.sql` in Supabase SQL Editor.

**What it does:**
1. Shows current status (how many active terms)
2. Lists all active terms
3. Deactivates all except the most recent one
4. Verifies only one is active

### Step 2: Frontend Fix (Already Applied)

Updated both components to:
- ✅ Get the most recent active term (in case multiple exist)
- ✅ Order by `created_at DESC` and limit to 1
- ✅ Handle gracefully if none exist

**Files Updated:**
- ✅ `src/pages/owner/OwnerPrivacy.tsx` - Now gets latest active term
- ✅ `src/pages/AdminPrivacySettings.tsx` - Now gets latest active term

## Recommendation

**Keep the latest term active** (created on January 22, 2026) because:
- It's the most recent
- It appears to have the most complete content ("mymoto app: Privacy Policy & Terms of Service")
- It's the latest version

## After Running the Fix

1. ✅ Only 1 active term will remain
2. ✅ Frontend will display the correct terms
3. ✅ Admin can update terms normally
4. ✅ Future updates will properly deactivate old versions

## Prevention

The `AdminPrivacySettings.tsx` component already handles this correctly:
- When saving new terms, it deactivates the old one first
- Then creates a new active version

The issue likely occurred from:
- Manual database edits
- Multiple migrations inserting terms
- Testing/admin actions

---

**Action Required:** Run `FIX_MULTIPLE_ACTIVE_PRIVACY_TERMS.sql` to clean up the database.
