# Fix Privacy & Security Terms Issue

## Problem

User sees error: "Privacy & Security terms are not available at this time."

This happens when:
1. No active terms exist in the database
2. The migration hasn't been run
3. All terms have been deactivated

## Solution

### Step 1: Check Database Status

Run `CHECK_PRIVACY_TERMS.sql` in Supabase SQL Editor to:
- Verify table exists
- Check if terms exist
- See active/inactive status
- Check RLS policies

### Step 2: Insert Default Terms (if needed)

If no active terms exist, the SQL script will automatically insert default terms.

**Or manually run:**

```sql
-- Insert default terms if none exist
INSERT INTO privacy_security_terms (terms_content, version, is_active)
SELECT 
  'PRIVACY & SECURITY TERMS

Last Updated: January 23, 2026

1. DATA COLLECTION AND USAGE

MyMoto collects and processes the following information to provide our vehicle tracking and management services:

• Vehicle Location Data: GPS coordinates, speed, heading, and movement patterns
• Vehicle Status: Battery level, ignition status, mileage, and diagnostic information
• User Account Information: Name, email, phone number, and profile preferences
• Usage Data: App interactions, feature usage, and communication logs

We use this data to:
• Provide real-time vehicle tracking and monitoring
• Generate trip reports and analytics
• Send proactive notifications and alerts
• Improve our services and user experience
• Ensure platform security and prevent fraud

2. DATA STORAGE AND SECURITY

• All data is encrypted in transit and at rest
• We use industry-standard security measures to protect your information
• Location data is stored securely and retained according to our data retention policy
• Access to your data is restricted to authorized personnel only

3. LOCATION TRACKING

• Location tracking is enabled when you use MyMoto services
• You can disable location tracking in your account settings
• Historical location data is used to generate trip reports and analytics
• Location data is shared only with authorized users assigned to your vehicles

4. THIRD-PARTY SERVICES

• We use third-party services (GPS51, Mapbox) for core functionality
• These services may process your data according to their own privacy policies
• We do not sell your personal information to third parties

5. USER RIGHTS

You have the right to:
• Access your personal data
• Request correction of inaccurate data
• Request deletion of your account and data
• Opt-out of non-essential data collection
• Export your data in a portable format

6. DATA RETENTION

• Active account data is retained while your account is active
• Location history is retained for up to 90 days
• Trip records are retained for up to 1 year
• Deleted account data is permanently removed within 30 days

7. COMMUNICATIONS

• We may send you notifications about vehicle alerts, system updates, and important information
• You can manage notification preferences in your account settings
• Marketing communications are opt-in only

8. CHILDREN''S PRIVACY

• MyMoto is not intended for users under 18 years of age
• We do not knowingly collect data from children

9. CHANGES TO TERMS

• We may update these terms from time to time
• You will be notified of significant changes
• Continued use of the service constitutes acceptance of updated terms

10. CONTACT US

For privacy concerns or data requests, contact us at:
Email: privacy@mymoto.com
Support: support@mymoto.com

By using MyMoto, you acknowledge that you have read, understood, and agree to these Privacy & Security Terms.',
  '1.0',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM privacy_security_terms WHERE is_active = true
);
```

### Step 3: Verify Migration Was Run

If the table doesn't exist, run the migration:

```sql
-- Check if migration was run
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'privacy_security_terms';

-- If table doesn't exist, run migration:
-- supabase/migrations/20260117000002_create_privacy_security_terms.sql
```

## Frontend Fix Applied

Updated `OwnerPrivacy.tsx` to:
- ✅ Handle missing terms gracefully (show empty state instead of error)
- ✅ Better error messages for table missing vs. no terms
- ✅ Improved user experience when terms aren't available

## Quick Fix Commands

### Option 1: Check and Insert (Recommended)
```sql
-- Run CHECK_PRIVACY_TERMS.sql in Supabase SQL Editor
-- It will automatically insert default terms if none exist
```

### Option 2: Manual Insert
```sql
-- Check current status
SELECT COUNT(*) FROM privacy_security_terms WHERE is_active = true;

-- If 0, insert default terms (use the SQL from Step 2 above)
```

### Option 3: Reactivate Existing Terms
```sql
-- If terms exist but are inactive, reactivate the latest version
UPDATE privacy_security_terms
SET is_active = true
WHERE id = (
  SELECT id FROM privacy_security_terms
  ORDER BY created_at DESC
  LIMIT 1
);
```

## Verification

After fixing, verify:
1. ✅ Table exists
2. ✅ At least one active term exists
3. ✅ RLS policies allow reading
4. ✅ Frontend can fetch terms

Run this to verify:
```sql
SELECT 
  id,
  version,
  is_active,
  created_at,
  LEFT(terms_content, 50) as preview
FROM privacy_security_terms
WHERE is_active = true;
```

---

**Status:** Frontend updated to handle gracefully. Run SQL to insert terms if missing.
