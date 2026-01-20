-- Alert Dismissal Tracking Migration
-- Enables persistence learning by tracking which alerts users dismiss

CREATE TABLE IF NOT EXISTS alert_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate dismissals within same hour
  UNIQUE(device_id, user_id, alert_type, DATE_TRUNC('hour', dismissed_at))
);

-- Index for fast lookups of recent dismissals
CREATE INDEX IF NOT EXISTS idx_alert_dismissals_device_user_type_dismissed
ON alert_dismissals(device_id, user_id, alert_type, dismissed_at DESC)
WHERE dismissed_at >= NOW() - INTERVAL '7 days';

-- Index for counting dismissals
CREATE INDEX IF NOT EXISTS idx_alert_dismissals_user_type_count
ON alert_dismissals(user_id, alert_type, dismissed_at DESC);

-- Enable RLS
ALTER TABLE alert_dismissals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own dismissals
CREATE POLICY "Users can view their own dismissals"
ON alert_dismissals FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own dismissals
CREATE POLICY "Users can create their own dismissals"
ON alert_dismissals FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can see all dismissals
CREATE POLICY "Admins can view all dismissals"
ON alert_dismissals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Add comments
COMMENT ON TABLE alert_dismissals IS 'Tracks alert dismissals for persistence learning - if dismissed 3+ times, suppress individual alerts and send weekly digest';
COMMENT ON INDEX idx_alert_dismissals_device_user_type_dismissed IS 'Optimizes queries for recent dismissals (last 7 days)';
COMMENT ON INDEX idx_alert_dismissals_user_type_count IS 'Optimizes queries for counting dismissals by user and type';
