-- Privacy & Security Terms System
-- Allows admin to set terms and track user agreements

-- Terms table (single row - admin can update)
CREATE TABLE IF NOT EXISTS public.privacy_security_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terms_content TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- User terms agreements table
CREATE TABLE IF NOT EXISTS public.user_terms_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  agreed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  UNIQUE(user_id, terms_version)
);

-- Enable RLS
ALTER TABLE public.privacy_security_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_terms_agreements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Anyone can read active terms" ON public.privacy_security_terms;
DROP POLICY IF EXISTS "Admins can manage terms" ON public.privacy_security_terms;
DROP POLICY IF EXISTS "Users can view their own agreements" ON public.user_terms_agreements;
DROP POLICY IF EXISTS "Users can create their own agreements" ON public.user_terms_agreements;
DROP POLICY IF EXISTS "Service role can read all agreements" ON public.user_terms_agreements;

-- Privacy & Security Terms RLS Policies
-- Anyone can read active terms
CREATE POLICY "Anyone can read active terms"
ON public.privacy_security_terms
FOR SELECT
USING (is_active = true);

-- Admins can manage terms
CREATE POLICY "Admins can manage terms"
ON public.privacy_security_terms
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- User Terms Agreements RLS Policies
-- Users can view their own agreements
CREATE POLICY "Users can view their own agreements"
ON public.user_terms_agreements
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own agreements
CREATE POLICY "Users can create their own agreements"
ON public.user_terms_agreements
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Service role can read all agreements (for edge functions)
CREATE POLICY "Service role can read all agreements"
ON public.user_terms_agreements
FOR SELECT
USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_terms_agreements_user_id 
ON public.user_terms_agreements(user_id);

CREATE INDEX IF NOT EXISTS idx_user_terms_agreements_agreed_at 
ON public.user_terms_agreements(agreed_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_privacy_security_terms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_privacy_security_terms_updated_at ON public.privacy_security_terms;

CREATE TRIGGER update_privacy_security_terms_updated_at
BEFORE UPDATE ON public.privacy_security_terms
FOR EACH ROW
EXECUTE FUNCTION update_privacy_security_terms_updated_at();

-- Insert default terms
INSERT INTO public.privacy_security_terms (terms_content, version, is_active)
VALUES (
  'PRIVACY & SECURITY TERMS

Last Updated: January 17, 2026

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
)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.privacy_security_terms IS 'Stores privacy and security terms that users must agree to';
COMMENT ON TABLE public.user_terms_agreements IS 'Tracks when users agreed to privacy and security terms';
