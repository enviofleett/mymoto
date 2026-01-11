-- ================================================
-- PHASE 3-4 ADVANCED FEATURES DATABASE SCHEMA
-- ================================================

-- 1. LLM Analytics Table - Track model performance
CREATE TABLE public.llm_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT,
    user_id UUID REFERENCES auth.users(id),
    query_type TEXT NOT NULL,
    model_used TEXT NOT NULL,
    tokens_input INTEGER,
    tokens_output INTEGER,
    latency_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    fallback_used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Alert Rules Table - Configurable alerting
CREATE TABLE public.alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('threshold', 'pattern', 'predictive', 'anomaly', 'geofence')),
    target_type TEXT NOT NULL CHECK (target_type IN ('vehicle', 'fleet', 'user')),
    target_id TEXT, -- device_id, user_id, or NULL for fleet-wide
    conditions JSONB NOT NULL DEFAULT '{}',
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    channels TEXT[] NOT NULL DEFAULT ARRAY['push'],
    is_active BOOLEAN NOT NULL DEFAULT true,
    cooldown_minutes INTEGER DEFAULT 15,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Alert Dispatch Log - Track all alert deliveries
CREATE TABLE public.alert_dispatch_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES proactive_vehicle_events(id),
    rule_id UUID REFERENCES alert_rules(id),
    channel TEXT NOT NULL CHECK (channel IN ('push', 'email', 'sms', 'webhook', 'chat')),
    recipient TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. User Preferences Table - Learning & Personalization
CREATE TABLE public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    preference_key TEXT NOT NULL,
    preference_value JSONB NOT NULL,
    confidence_score NUMERIC(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    source TEXT NOT NULL DEFAULT 'inferred' CHECK (source IN ('explicit', 'inferred', 'default')),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, preference_key)
);

-- ================================================
-- INDEXES FOR PERFORMANCE
-- ================================================

CREATE INDEX idx_llm_analytics_device ON llm_analytics(device_id);
CREATE INDEX idx_llm_analytics_created ON llm_analytics(created_at DESC);
CREATE INDEX idx_llm_analytics_model ON llm_analytics(model_used);

CREATE INDEX idx_alert_rules_target ON alert_rules(target_type, target_id);
CREATE INDEX idx_alert_rules_active ON alert_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_alert_rules_type ON alert_rules(rule_type);

CREATE INDEX idx_dispatch_log_event ON alert_dispatch_log(event_id);
CREATE INDEX idx_dispatch_log_status ON alert_dispatch_log(status);
CREATE INDEX idx_dispatch_log_created ON alert_dispatch_log(created_at DESC);

CREATE INDEX idx_user_preferences_user ON user_preferences(user_id);
CREATE INDEX idx_user_preferences_key ON user_preferences(preference_key);

-- ================================================
-- ROW LEVEL SECURITY
-- ================================================

ALTER TABLE llm_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_dispatch_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- LLM Analytics: Users see their own, admins see all
CREATE POLICY "Users view own analytics"
ON llm_analytics FOR SELECT
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role inserts analytics"
ON llm_analytics FOR INSERT
WITH CHECK (true);

-- Alert Rules: Admins manage, users view their own vehicle rules
CREATE POLICY "Admins manage alert rules"
ON alert_rules FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view relevant rules"
ON alert_rules FOR SELECT
USING (
    target_type = 'fleet' 
    OR (target_type = 'user' AND target_id = auth.uid()::text)
    OR (target_type = 'vehicle' AND EXISTS (
        SELECT 1 FROM vehicle_assignments 
        WHERE device_id = alert_rules.target_id 
        AND profile_id = auth.uid()
    ))
);

-- Alert Dispatch Log: Users see dispatches for their events
CREATE POLICY "Users view own dispatches"
ON alert_dispatch_log FOR SELECT
USING (
    has_role(auth.uid(), 'admin')
    OR EXISTS (
        SELECT 1 FROM proactive_vehicle_events pve
        JOIN vehicle_assignments va ON va.device_id = pve.device_id
        WHERE pve.id = alert_dispatch_log.event_id
        AND va.profile_id = auth.uid()
    )
);

CREATE POLICY "Service role manages dispatches"
ON alert_dispatch_log FOR ALL
USING (true);

-- User Preferences: Users manage their own
CREATE POLICY "Users manage own preferences"
ON user_preferences FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all preferences"
ON user_preferences FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- ================================================
-- TRIGGERS
-- ================================================

-- Auto-update updated_at on alert_rules
CREATE TRIGGER update_alert_rules_updated_at
BEFORE UPDATE ON alert_rules
FOR EACH ROW
EXECUTE FUNCTION update_wallet_updated_at();

-- ================================================
-- DEFAULT ALERT RULES (Fleet-wide)
-- ================================================

INSERT INTO alert_rules (name, description, rule_type, target_type, conditions, severity, channels) VALUES
('Low Battery Alert', 'Trigger when battery drops below 20%', 'threshold', 'fleet', '{"field": "battery_percent", "operator": "<", "value": 20}', 'warning', ARRAY['push', 'email']),
('Critical Battery Alert', 'Trigger when battery drops below 10%', 'threshold', 'fleet', '{"field": "battery_percent", "operator": "<", "value": 10}', 'critical', ARRAY['push', 'email', 'sms']),
('Overspeeding Alert', 'Trigger when speed exceeds 120 km/h', 'threshold', 'fleet', '{"field": "speed", "operator": ">", "value": 120}', 'error', ARRAY['push']),
('Vehicle Offline Alert', 'Trigger when vehicle offline for 1+ hour', 'pattern', 'fleet', '{"pattern": "offline", "duration_minutes": 60}', 'warning', ARRAY['push', 'email']),
('Unusual Activity Alert', 'Detect movement outside normal hours', 'anomaly', 'fleet', '{"check": "off_hours_movement", "start_hour": 23, "end_hour": 5}', 'warning', ARRAY['push']);