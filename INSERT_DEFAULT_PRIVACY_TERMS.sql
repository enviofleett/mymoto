-- ============================================================================
-- Insert Default Privacy & Security Terms
-- ============================================================================
-- Run this in Supabase SQL Editor if no active terms exist
-- ============================================================================

-- First, check if any active terms exist
DO $$
DECLARE
  active_count INTEGER;
BEGIN
  -- Count active terms
  SELECT COUNT(*) INTO active_count
  FROM privacy_security_terms
  WHERE is_active = true;
  
  -- If no active terms, insert default
  IF active_count = 0 THEN
    INSERT INTO privacy_security_terms (terms_content, version, is_active)
    VALUES (
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
    );
    
    RAISE NOTICE '✅ Default privacy terms inserted successfully';
  ELSE
    RAISE NOTICE 'ℹ️ Active terms already exist (count: %)', active_count;
  END IF;
END $$;

-- Verify the insert
SELECT 
  id,
  version,
  is_active,
  created_at,
  LEFT(terms_content, 100) as preview
FROM privacy_security_terms
WHERE is_active = true;
