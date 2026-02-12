-- Vehicle Health Metrics and Predictive Maintenance System

-- Health metric types
CREATE TYPE health_metric_type AS ENUM (
  'battery_health',
  'engine_performance',
  'driving_behavior',
  'connectivity',
  'overall'
);

-- Maintenance priority levels
CREATE TYPE maintenance_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

-- Vehicle health metrics table
CREATE TABLE public.vehicle_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,

  -- Health scores (0-100)
  overall_health_score INTEGER NOT NULL,
  battery_health_score INTEGER,
  engine_performance_score INTEGER,
  driving_behavior_score INTEGER,
  connectivity_score INTEGER,

  -- Metric details
  metrics_data JSONB DEFAULT '{}'::jsonb,

  -- Trends
  trend TEXT, -- 'improving', 'stable', 'declining', 'critical'
  previous_score INTEGER,
  score_change INTEGER,

  -- Timestamps
  measured_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE,
  CONSTRAINT valid_overall_score CHECK (overall_health_score >= 0 AND overall_health_score <= 100),
  CONSTRAINT valid_battery_score CHECK (battery_health_score IS NULL OR (battery_health_score >= 0 AND battery_health_score <= 100)),
  CONSTRAINT valid_engine_score CHECK (engine_performance_score IS NULL OR (engine_performance_score >= 0 AND engine_performance_score <= 100)),
  CONSTRAINT valid_driving_score CHECK (driving_behavior_score IS NULL OR (driving_behavior_score >= 0 AND driving_behavior_score <= 100)),
  CONSTRAINT valid_connectivity_score CHECK (connectivity_score IS NULL OR (connectivity_score >= 0 AND connectivity_score <= 100))
);

CREATE INDEX idx_vehicle_health_device_time ON vehicle_health_metrics(device_id, measured_at DESC);
CREATE INDEX idx_vehicle_health_score ON vehicle_health_metrics(overall_health_score ASC, measured_at DESC);

-- Predictive maintenance recommendations table
CREATE TABLE public.maintenance_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,

  -- Recommendation details
  title TEXT NOT NULL,
  description TEXT,
  recommendation_type TEXT NOT NULL, -- 'battery', 'engine', 'behavior', 'connectivity', 'general'
  priority maintenance_priority NOT NULL DEFAULT 'medium',

  -- Prediction data
  predicted_issue TEXT,
  confidence_score DECIMAL(3, 2), -- 0-1
  estimated_days_until_failure INTEGER,

  -- Supporting metrics
  trigger_metric TEXT,
  threshold_value DECIMAL,
  current_value DECIMAL,
  supporting_data JSONB DEFAULT '{}'::jsonb,

  -- Status tracking
  status TEXT DEFAULT 'active', -- 'active', 'acknowledged', 'resolved', 'dismissed'
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

CREATE INDEX idx_maintenance_recommendations_device ON maintenance_recommendations(device_id, status, priority);
CREATE INDEX idx_maintenance_recommendations_priority ON maintenance_recommendations(priority, status);
CREATE INDEX idx_maintenance_recommendations_active ON maintenance_recommendations(status, created_at DESC) WHERE status = 'active';

-- Enable RLS
ALTER TABLE public.vehicle_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view health metrics"
ON public.vehicle_health_metrics FOR SELECT
USING (true);

CREATE POLICY "Users can view maintenance recommendations"
ON public.maintenance_recommendations FOR SELECT
USING (true);

CREATE POLICY "Admins can manage health data"
ON public.vehicle_health_metrics FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage maintenance recommendations"
ON public.maintenance_recommendations FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Function to calculate battery health score
CREATE OR REPLACE FUNCTION calculate_battery_health_score(
  p_device_id TEXT,
  p_current_battery DECIMAL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  health_score INTEGER := 100;
  avg_battery_drain DECIMAL;
  low_battery_count INTEGER;
  critical_battery_count INTEGER;
BEGIN
  -- Analyze battery patterns from last 7 days
  SELECT
    COUNT(*) FILTER (WHERE battery_percent < 20) AS low_count,
    COUNT(*) FILTER (WHERE battery_percent < 10) AS critical_count
  INTO low_battery_count, critical_battery_count
  FROM position_history
  WHERE device_id = p_device_id
    AND gps_time >= now() - INTERVAL '7 days'
    AND battery_percent IS NOT NULL;

  -- Penalize for frequent low battery
  health_score := health_score - (low_battery_count * 2);
  health_score := health_score - (critical_battery_count * 5);

  -- Penalize current low battery
  IF p_current_battery IS NOT NULL THEN
    IF p_current_battery < 10 THEN
      health_score := health_score - 30;
    ELSIF p_current_battery < 20 THEN
      health_score := health_score - 15;
    ELSIF p_current_battery < 30 THEN
      health_score := health_score - 5;
    END IF;
  END IF;

  RETURN GREATEST(health_score, 0);
END;
$$;

-- Function to calculate driving behavior score
CREATE OR REPLACE FUNCTION calculate_driving_behavior_score(
  p_device_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  health_score INTEGER := 100;
  overspeeding_count INTEGER;
  harsh_events_count INTEGER;
  idle_hours DECIMAL;
BEGIN
  -- Analyze driving patterns from last 7 days
  SELECT
    COUNT(*) FILTER (WHERE speed > 100) AS overspeed_count
  INTO overspeeding_count
  FROM position_history
  WHERE device_id = p_device_id
    AND gps_time >= now() - INTERVAL '7 days';

  -- Count harsh driving events from proactive events
  SELECT COUNT(*) INTO harsh_events_count
  FROM proactive_vehicle_events
  WHERE device_id = p_device_id
    AND event_type IN ('harsh_braking', 'rapid_acceleration')
    AND created_at >= now() - INTERVAL '7 days';

  -- Penalize for poor driving behavior
  health_score := health_score - (overspeeding_count * 3);
  health_score := health_score - (harsh_events_count * 5);

  RETURN GREATEST(health_score, 0);
END;
$$;

-- Function to calculate connectivity score
CREATE OR REPLACE FUNCTION calculate_connectivity_score(
  p_device_id TEXT,
  p_is_online BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  health_score INTEGER := 100;
  offline_count INTEGER;
  avg_gap_hours DECIMAL;
BEGIN
  -- Count offline events in last 7 days
  SELECT COUNT(*) INTO offline_count
  FROM proactive_vehicle_events
  WHERE device_id = p_device_id
    AND event_type = 'offline'
    AND created_at >= now() - INTERVAL '7 days';

  -- Penalize for frequent disconnections
  health_score := health_score - (offline_count * 10);

  -- Penalize if currently offline
  IF NOT p_is_online THEN
    health_score := health_score - 20;
  END IF;

  RETURN GREATEST(health_score, 0);
END;
$$;

-- Master function to calculate overall vehicle health
CREATE OR REPLACE FUNCTION calculate_vehicle_health(
  p_device_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_pos RECORD;
  battery_score INTEGER;
  driving_score INTEGER;
  connectivity_score INTEGER;
  overall_score INTEGER;
  previous_health RECORD;
  trend_value TEXT;
  health_id UUID;
BEGIN
  -- Get current vehicle position
  SELECT * INTO current_pos
  FROM vehicle_positions
  WHERE device_id = p_device_id;

  IF current_pos IS NULL THEN
    RAISE EXCEPTION 'Vehicle position not found for device %', p_device_id;
  END IF;

  -- Calculate individual health scores
  battery_score := calculate_battery_health_score(p_device_id, current_pos.battery_percent);
  driving_score := calculate_driving_behavior_score(p_device_id);
  connectivity_score := calculate_connectivity_score(p_device_id, current_pos.is_online);

  -- Calculate overall health (weighted average)
  overall_score := (
    (battery_score * 0.35) +
    (driving_score * 0.35) +
    (connectivity_score * 0.30)
  )::INTEGER;

  -- Get previous health metric
  SELECT * INTO previous_health
  FROM vehicle_health_metrics
  WHERE device_id = p_device_id
  ORDER BY measured_at DESC
  LIMIT 1;

  -- Determine trend
  IF previous_health.overall_health_score IS NOT NULL THEN
    DECLARE
      score_diff INTEGER := overall_score - previous_health.overall_health_score;
    BEGIN
      IF overall_score < 40 THEN
        trend_value := 'critical';
      ELSIF score_diff > 10 THEN
        trend_value := 'improving';
      ELSIF score_diff < -10 THEN
        trend_value := 'declining';
      ELSE
        trend_value := 'stable';
      END IF;
    END;
  ELSE
    trend_value := 'stable';
  END IF;

  -- Insert new health metric
  INSERT INTO vehicle_health_metrics (
    device_id,
    overall_health_score,
    battery_health_score,
    driving_behavior_score,
    connectivity_score,
    metrics_data,
    trend,
    previous_score,
    score_change
  ) VALUES (
    p_device_id,
    overall_score,
    battery_score,
    driving_score,
    connectivity_score,
    jsonb_build_object(
      'battery_percent', current_pos.battery_percent,
      'is_online', current_pos.is_online,
      'speed', current_pos.speed,
      'ignition_on', current_pos.ignition_on
    ),
    trend_value,
    previous_health.overall_health_score,
    overall_score - COALESCE(previous_health.overall_health_score, overall_score)
  )
  RETURNING id INTO health_id;

  -- Generate maintenance recommendations if health is poor
  IF overall_score < 60 THEN
    PERFORM generate_maintenance_recommendations(p_device_id, battery_score, driving_score, connectivity_score);
  END IF;

  RETURN health_id;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_vehicle_health TO service_role, authenticated;

-- Function to generate maintenance recommendations
CREATE OR REPLACE FUNCTION generate_maintenance_recommendations(
  p_device_id TEXT,
  p_battery_score INTEGER,
  p_driving_score INTEGER,
  p_connectivity_score INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Battery maintenance recommendations
  IF p_battery_score < 50 THEN
    INSERT INTO maintenance_recommendations (
      device_id,
      title,
      description,
      recommendation_type,
      priority,
      predicted_issue,
      confidence_score,
      trigger_metric,
      current_value,
      status
    ) VALUES (
      p_device_id,
      'Battery Health Warning',
      'Vehicle battery showing signs of degradation. Frequent low battery events detected.',
      'battery',
      CASE
        WHEN p_battery_score < 30 THEN 'urgent'::maintenance_priority
        WHEN p_battery_score < 40 THEN 'high'::maintenance_priority
        ELSE 'medium'::maintenance_priority
      END,
      'Battery failure or reduced capacity',
      0.75,
      'battery_health_score',
      p_battery_score,
      'active'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Driving behavior recommendations
  IF p_driving_score < 60 THEN
    INSERT INTO maintenance_recommendations (
      device_id,
      title,
      description,
      recommendation_type,
      priority,
      predicted_issue,
      confidence_score,
      trigger_metric,
      current_value,
      status
    ) VALUES (
      p_device_id,
      'Driving Behavior Alert',
      'Frequent harsh driving detected. This may lead to increased wear and tear.',
      'behavior',
      CASE
        WHEN p_driving_score < 40 THEN 'high'::maintenance_priority
        ELSE 'medium'::maintenance_priority
      END,
      'Increased maintenance needs due to aggressive driving',
      0.65,
      'driving_behavior_score',
      p_driving_score,
      'active'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Connectivity recommendations
  IF p_connectivity_score < 70 THEN
    INSERT INTO maintenance_recommendations (
      device_id,
      title,
      description,
      recommendation_type,
      priority,
      predicted_issue,
      confidence_score,
      trigger_metric,
      current_value,
      status
    ) VALUES (
      p_device_id,
      'Connectivity Issues',
      'Frequent GPS disconnections detected. Check device installation and antenna.',
      'connectivity',
      CASE
        WHEN p_connectivity_score < 50 THEN 'high'::maintenance_priority
        ELSE 'medium'::maintenance_priority
      END,
      'GPS device malfunction or poor signal',
      0.70,
      'connectivity_score',
      p_connectivity_score,
      'active'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Function to get latest health metrics
DROP FUNCTION IF EXISTS get_vehicle_health(TEXT);
CREATE OR REPLACE FUNCTION get_vehicle_health(
  p_device_id TEXT
)
RETURNS TABLE (
  overall_health_score INTEGER,
  battery_health_score INTEGER,
  driving_behavior_score INTEGER,
  connectivity_score INTEGER,
  trend TEXT,
  score_change INTEGER,
  measured_at TIMESTAMP WITH TIME ZONE,
  active_recommendations INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vhm.overall_health_score,
    vhm.battery_health_score,
    vhm.driving_behavior_score,
    vhm.connectivity_score,
    vhm.trend,
    vhm.score_change,
    vhm.measured_at,
    (SELECT COUNT(*)::INTEGER
     FROM maintenance_recommendations mr
     WHERE mr.device_id = p_device_id
       AND mr.status = 'active') AS active_recommendations
  FROM vehicle_health_metrics vhm
  WHERE vhm.device_id = p_device_id
  ORDER BY vhm.measured_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_vehicle_health TO authenticated;

-- Function to get active maintenance recommendations
CREATE OR REPLACE FUNCTION get_maintenance_recommendations(
  p_device_id TEXT,
  p_status TEXT DEFAULT 'active'
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  recommendation_type TEXT,
  priority maintenance_priority,
  predicted_issue TEXT,
  confidence_score DECIMAL,
  estimated_days_until_failure INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  days_since_created INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mr.id,
    mr.title,
    mr.description,
    mr.recommendation_type,
    mr.priority,
    mr.predicted_issue,
    mr.confidence_score,
    mr.estimated_days_until_failure,
    mr.created_at,
    EXTRACT(DAYS FROM (now() - mr.created_at))::INTEGER AS days_since_created
  FROM maintenance_recommendations mr
  WHERE mr.device_id = p_device_id
    AND mr.status = p_status
  ORDER BY
    CASE mr.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    mr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_maintenance_recommendations TO authenticated;

-- Comments
COMMENT ON TABLE vehicle_health_metrics IS 'Stores calculated health scores for vehicles based on telemetry analysis';
COMMENT ON TABLE maintenance_recommendations IS 'Predictive maintenance recommendations generated from health analysis';
COMMENT ON FUNCTION calculate_vehicle_health IS 'Calculates comprehensive health scores and generates maintenance recommendations';
COMMENT ON FUNCTION get_vehicle_health IS 'Returns the latest health metrics for a vehicle';
COMMENT ON FUNCTION get_maintenance_recommendations IS 'Returns active maintenance recommendations for a vehicle';
