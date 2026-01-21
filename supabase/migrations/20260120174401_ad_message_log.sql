-- Ad Message Log Table
-- Tracks sent ad messages to prevent duplicate sends and spam
-- This table is critical for the match-ads cron function

CREATE TABLE IF NOT EXISTS public.ad_message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  message_content TEXT,
  
  -- Prevent duplicate sends per day
  CONSTRAINT unique_campaign_device_date UNIQUE(campaign_id, device_id, DATE(sent_at))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ad_log_device_date 
ON ad_message_log(device_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_log_campaign 
ON ad_message_log(campaign_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_log_recent 
ON ad_message_log(sent_at DESC) 
WHERE sent_at > NOW() - INTERVAL '24 hours';

-- Enable RLS
ALTER TABLE public.ad_message_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role can insert (for edge functions)
CREATE POLICY IF NOT EXISTS "Service role manages ad logs"
ON ad_message_log FOR ALL
USING (true)
WITH CHECK (true);

-- Providers can view logs for their campaigns
CREATE POLICY IF NOT EXISTS "Providers view own campaign logs"
ON ad_message_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM ad_campaigns ac
    JOIN service_providers sp ON sp.id = ac.provider_id
    JOIN profiles p ON p.id = sp.profile_id
    WHERE ac.id = ad_message_log.campaign_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
);

-- Admins can view all logs
CREATE POLICY IF NOT EXISTS "Admins view all ad logs"
ON ad_message_log FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Function to check if ad was recently sent (for throttling)
CREATE OR REPLACE FUNCTION was_ad_recently_sent(
  p_campaign_id UUID,
  p_device_id TEXT,
  p_hours_threshold INTEGER DEFAULT 24
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ad_message_log
    WHERE campaign_id = p_campaign_id
    AND device_id = p_device_id
    AND sent_at > NOW() - (p_hours_threshold || ' hours')::INTERVAL
  );
$$;

GRANT EXECUTE ON FUNCTION was_ad_recently_sent TO authenticated, service_role;

COMMENT ON TABLE ad_message_log IS 'Tracks sent ad messages to prevent duplicate sends and spam';
COMMENT ON FUNCTION was_ad_recently_sent IS 'Checks if an ad was sent to a device within the threshold hours';
