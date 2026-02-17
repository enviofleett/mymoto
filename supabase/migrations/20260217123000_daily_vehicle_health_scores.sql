-- Canonical daily GPS-derived vehicle health scoring (reliability-first)

CREATE TABLE IF NOT EXISTS public.vehicle_health_features_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
  score_date DATE NOT NULL,

  points_count INTEGER NOT NULL DEFAULT 0,
  transition_count INTEGER NOT NULL DEFAULT 0,
  trip_count INTEGER NOT NULL DEFAULT 0,
  distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
  moving_minutes NUMERIC(10, 2) NOT NULL DEFAULT 0,

  idle_minutes NUMERIC(10, 2) NOT NULL DEFAULT 0,
  idle_event_count INTEGER NOT NULL DEFAULT 0,
  overspeed_event_count INTEGER NOT NULL DEFAULT 0,
  harsh_event_count INTEGER NOT NULL DEFAULT 0,
  offline_event_count INTEGER NOT NULL DEFAULT 0,

  speeding_exposure_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  max_gap_minutes NUMERIC(10, 2) NOT NULL DEFAULT 0,
  impossible_jump_count INTEGER NOT NULL DEFAULT 0,
  gps_drift_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0,

  avg_battery_percent NUMERIC(5, 2),
  min_battery_percent INTEGER,

  avg_sampling_interval_minutes NUMERIC(10, 4),
  data_completeness_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  low_sample_day BOOLEAN NOT NULL DEFAULT false,

  features_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT vehicle_health_features_daily_device_date_key UNIQUE (device_id, score_date),
  CONSTRAINT vehicle_health_features_daily_data_completeness_check CHECK (data_completeness_pct >= 0 AND data_completeness_pct <= 100),
  CONSTRAINT vehicle_health_features_daily_speeding_exposure_check CHECK (speeding_exposure_pct >= 0 AND speeding_exposure_pct <= 100),
  CONSTRAINT vehicle_health_features_daily_drift_ratio_check CHECK (gps_drift_ratio >= 0 AND gps_drift_ratio <= 1)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_health_features_daily_device_date
  ON public.vehicle_health_features_daily(device_id, score_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_health_features_daily_score_date
  ON public.vehicle_health_features_daily(score_date DESC);

CREATE TABLE IF NOT EXISTS public.vehicle_health_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
  score_date DATE NOT NULL,

  health_score INTEGER NOT NULL,
  confidence_score INTEGER NOT NULL,
  trend TEXT NOT NULL DEFAULT 'stable',

  component_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  feature_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version TEXT NOT NULL DEFAULT 'daily-gps-health-v1',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT vehicle_health_daily_device_date_key UNIQUE (device_id, score_date),
  CONSTRAINT vehicle_health_daily_health_score_check CHECK (health_score >= 0 AND health_score <= 100),
  CONSTRAINT vehicle_health_daily_confidence_score_check CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_health_daily_device_date
  ON public.vehicle_health_daily(device_id, score_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_health_daily_score_date
  ON public.vehicle_health_daily(score_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_health_daily_health_score
  ON public.vehicle_health_daily(health_score, score_date DESC);

ALTER TABLE public.vehicle_health_features_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_health_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read daily health features" ON public.vehicle_health_features_daily;
CREATE POLICY "Authenticated users can read daily health features"
ON public.vehicle_health_features_daily
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Service role can manage daily health features" ON public.vehicle_health_features_daily;
CREATE POLICY "Service role can manage daily health features"
ON public.vehicle_health_features_daily
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can manage daily health features" ON public.vehicle_health_features_daily;
CREATE POLICY "Admins can manage daily health features"
ON public.vehicle_health_features_daily
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can read daily health scores" ON public.vehicle_health_daily;
CREATE POLICY "Authenticated users can read daily health scores"
ON public.vehicle_health_daily
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Service role can manage daily health scores" ON public.vehicle_health_daily;
CREATE POLICY "Service role can manage daily health scores"
ON public.vehicle_health_daily
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can manage daily health scores" ON public.vehicle_health_daily;
CREATE POLICY "Admins can manage daily health scores"
ON public.vehicle_health_daily
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.calculate_haversine_km(
  p_lat1 DOUBLE PRECISION,
  p_lon1 DOUBLE PRECISION,
  p_lat2 DOUBLE PRECISION,
  p_lon2 DOUBLE PRECISION
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_lat1 IS NULL OR p_lon1 IS NULL OR p_lat2 IS NULL OR p_lon2 IS NULL THEN 0
      ELSE (
        6371 * 2 * asin(
          sqrt(
            pow(sin(radians((p_lat2 - p_lat1) / 2)), 2) +
            cos(radians(p_lat1)) * cos(radians(p_lat2)) *
            pow(sin(radians((p_lon2 - p_lon1) / 2)), 2)
          )
        )
      )::numeric
    END;
$$;

CREATE OR REPLACE FUNCTION public.compute_vehicle_health_features_day(
  p_device_id TEXT,
  p_date DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_start TIMESTAMPTZ := p_date::timestamptz;
  v_day_end TIMESTAMPTZ := (p_date + INTERVAL '1 day')::timestamptz;

  v_points_count INTEGER := 0;
  v_transition_count INTEGER := 0;
  v_trip_count INTEGER := 0;
  v_distance_km NUMERIC(10, 2) := 0;
  v_moving_minutes NUMERIC(10, 2) := 0;

  v_idle_minutes NUMERIC(10, 2) := 0;
  v_idle_event_count INTEGER := 0;
  v_overspeed_event_count INTEGER := 0;
  v_harsh_event_count INTEGER := 0;
  v_offline_event_count INTEGER := 0;

  v_speeding_exposure_pct NUMERIC(5, 2) := 0;
  v_max_gap_minutes NUMERIC(10, 2) := 0;
  v_impossible_jump_count INTEGER := 0;
  v_gps_drift_ratio NUMERIC(6, 4) := 0;

  v_avg_battery_percent NUMERIC(5, 2);
  v_min_battery_percent INTEGER;

  v_avg_sampling_interval_minutes NUMERIC(10, 4);
  v_data_completeness_pct NUMERIC(5, 2) := 0;
  v_low_sample_day BOOLEAN := false;
  v_expected_points NUMERIC;
BEGIN
  WITH day_points AS (
    SELECT
      ph.gps_time,
      ph.latitude,
      ph.longitude,
      ph.speed,
      ph.battery_percent,
      lag(ph.gps_time) OVER (ORDER BY ph.gps_time) AS prev_gps_time,
      lag(ph.latitude) OVER (ORDER BY ph.gps_time) AS prev_latitude,
      lag(ph.longitude) OVER (ORDER BY ph.gps_time) AS prev_longitude
    FROM public.position_history ph
    WHERE ph.device_id = p_device_id
      AND ph.gps_time >= v_day_start
      AND ph.gps_time < v_day_end
  ),
  point_metrics AS (
    SELECT
      COUNT(*)::INTEGER AS points_count,
      COUNT(*) FILTER (WHERE prev_gps_time IS NOT NULL)::INTEGER AS transition_count,
      AVG(EXTRACT(EPOCH FROM (gps_time - prev_gps_time)) / 60.0)
        FILTER (WHERE prev_gps_time IS NOT NULL) AS avg_sampling_interval_minutes,
      MAX(EXTRACT(EPOCH FROM (gps_time - prev_gps_time)) / 60.0)
        FILTER (WHERE prev_gps_time IS NOT NULL) AS max_gap_minutes,
      AVG(battery_percent)::NUMERIC(5, 2) FILTER (WHERE battery_percent IS NOT NULL) AS avg_battery_percent,
      MIN(battery_percent)::INTEGER FILTER (WHERE battery_percent IS NOT NULL) AS min_battery_percent,
      COUNT(*) FILTER (WHERE speed > 100)::INTEGER AS speeding_points_count,
      COUNT(*) FILTER (
        WHERE prev_gps_time IS NOT NULL
          AND EXTRACT(EPOCH FROM (gps_time - prev_gps_time)) > 0
          AND public.calculate_haversine_km(prev_latitude, prev_longitude, latitude, longitude)
              / (EXTRACT(EPOCH FROM (gps_time - prev_gps_time)) / 3600.0) > 220
          AND public.calculate_haversine_km(prev_latitude, prev_longitude, latitude, longitude) > 1.0
      )::INTEGER AS impossible_jump_count,
      COUNT(*) FILTER (
        WHERE prev_gps_time IS NOT NULL
          AND COALESCE(speed, 0) < 3
          AND public.calculate_haversine_km(prev_latitude, prev_longitude, latitude, longitude) > 0.2
          AND EXTRACT(EPOCH FROM (gps_time - prev_gps_time)) <= 600
      )::INTEGER AS drift_points_count
    FROM day_points
  )
  SELECT
    pm.points_count,
    pm.transition_count,
    pm.avg_sampling_interval_minutes,
    COALESCE(pm.max_gap_minutes, 0)::NUMERIC(10, 2),
    pm.avg_battery_percent,
    pm.min_battery_percent,
    COALESCE(pm.impossible_jump_count, 0),
    CASE
      WHEN pm.transition_count > 0
        THEN (COALESCE(pm.drift_points_count, 0)::NUMERIC / pm.transition_count::NUMERIC)
      ELSE 0
    END::NUMERIC(6, 4),
    CASE
      WHEN pm.points_count > 0
        THEN (COALESCE(pm.speeding_points_count, 0)::NUMERIC * 100.0 / pm.points_count::NUMERIC)
      ELSE 0
    END::NUMERIC(5, 2)
  INTO
    v_points_count,
    v_transition_count,
    v_avg_sampling_interval_minutes,
    v_max_gap_minutes,
    v_avg_battery_percent,
    v_min_battery_percent,
    v_impossible_jump_count,
    v_gps_drift_ratio,
    v_speeding_exposure_pct
  FROM point_metrics pm;

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(vt.distance_km), 0)::NUMERIC(10, 2),
    COALESCE(SUM(vt.duration_seconds), 0)::NUMERIC / 60.0
  INTO
    v_trip_count,
    v_distance_km,
    v_moving_minutes
  FROM public.vehicle_trips vt
  WHERE vt.device_id = p_device_id
    AND vt.start_time >= v_day_start
    AND vt.start_time < v_day_end
    AND COALESCE(vt.source, 'gps51') IN ('gps51', 'gps51_parity');

  SELECT
    COUNT(*) FILTER (WHERE pve.event_type = 'idle_too_long')::INTEGER,
    COALESCE(AVG((pve.metadata ->> 'idle_minutes')::NUMERIC), 0)::NUMERIC(10, 2),
    COUNT(*) FILTER (WHERE pve.event_type = 'overspeeding')::INTEGER,
    COUNT(*) FILTER (WHERE pve.event_type IN ('harsh_braking', 'rapid_acceleration'))::INTEGER,
    COUNT(*) FILTER (WHERE pve.event_type = 'offline')::INTEGER
  INTO
    v_idle_event_count,
    v_idle_minutes,
    v_overspeed_event_count,
    v_harsh_event_count,
    v_offline_event_count
  FROM public.proactive_vehicle_events pve
  WHERE pve.device_id = p_device_id
    AND pve.created_at >= v_day_start
    AND pve.created_at < v_day_end;

  IF v_points_count < 24 THEN
    v_low_sample_day := true;
  END IF;

  IF COALESCE(v_avg_sampling_interval_minutes, 0) > 0 THEN
    v_expected_points := LEAST(1440, GREATEST(24, 1440.0 / v_avg_sampling_interval_minutes));
  ELSE
    v_expected_points := 288;
  END IF;

  v_data_completeness_pct := LEAST(100, GREATEST(0, (v_points_count::NUMERIC * 100.0) / NULLIF(v_expected_points, 0)))::NUMERIC(5, 2);

  INSERT INTO public.vehicle_health_features_daily (
    device_id,
    score_date,
    points_count,
    transition_count,
    trip_count,
    distance_km,
    moving_minutes,
    idle_minutes,
    idle_event_count,
    overspeed_event_count,
    harsh_event_count,
    offline_event_count,
    speeding_exposure_pct,
    max_gap_minutes,
    impossible_jump_count,
    gps_drift_ratio,
    avg_battery_percent,
    min_battery_percent,
    avg_sampling_interval_minutes,
    data_completeness_pct,
    low_sample_day,
    features_metadata,
    updated_at
  )
  VALUES (
    p_device_id,
    p_date,
    COALESCE(v_points_count, 0),
    COALESCE(v_transition_count, 0),
    COALESCE(v_trip_count, 0),
    COALESCE(v_distance_km, 0),
    COALESCE(v_moving_minutes, 0),
    COALESCE(v_idle_minutes, 0),
    COALESCE(v_idle_event_count, 0),
    COALESCE(v_overspeed_event_count, 0),
    COALESCE(v_harsh_event_count, 0),
    COALESCE(v_offline_event_count, 0),
    COALESCE(v_speeding_exposure_pct, 0),
    COALESCE(v_max_gap_minutes, 0),
    COALESCE(v_impossible_jump_count, 0),
    COALESCE(v_gps_drift_ratio, 0),
    v_avg_battery_percent,
    v_min_battery_percent,
    v_avg_sampling_interval_minutes,
    COALESCE(v_data_completeness_pct, 0),
    COALESCE(v_low_sample_day, false),
    jsonb_build_object(
      'expected_points', v_expected_points,
      'computed_at', now()
    ),
    now()
  )
  ON CONFLICT (device_id, score_date)
  DO UPDATE SET
    points_count = EXCLUDED.points_count,
    transition_count = EXCLUDED.transition_count,
    trip_count = EXCLUDED.trip_count,
    distance_km = EXCLUDED.distance_km,
    moving_minutes = EXCLUDED.moving_minutes,
    idle_minutes = EXCLUDED.idle_minutes,
    idle_event_count = EXCLUDED.idle_event_count,
    overspeed_event_count = EXCLUDED.overspeed_event_count,
    harsh_event_count = EXCLUDED.harsh_event_count,
    offline_event_count = EXCLUDED.offline_event_count,
    speeding_exposure_pct = EXCLUDED.speeding_exposure_pct,
    max_gap_minutes = EXCLUDED.max_gap_minutes,
    impossible_jump_count = EXCLUDED.impossible_jump_count,
    gps_drift_ratio = EXCLUDED.gps_drift_ratio,
    avg_battery_percent = EXCLUDED.avg_battery_percent,
    min_battery_percent = EXCLUDED.min_battery_percent,
    avg_sampling_interval_minutes = EXCLUDED.avg_sampling_interval_minutes,
    data_completeness_pct = EXCLUDED.data_completeness_pct,
    low_sample_day = EXCLUDED.low_sample_day,
    features_metadata = EXCLUDED.features_metadata,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_vehicle_health_score_day(
  p_device_id TEXT,
  p_date DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_features public.vehicle_health_features_daily%ROWTYPE;
  v_previous_score INTEGER;

  v_connectivity_score INTEGER;
  v_safety_score INTEGER;
  v_utilization_score INTEGER;
  v_data_quality_score INTEGER;

  v_raw_health NUMERIC;
  v_health_score INTEGER;
  v_confidence_score INTEGER;
  v_trend TEXT := 'stable';
BEGIN
  SELECT * INTO v_features
  FROM public.vehicle_health_features_daily
  WHERE device_id = p_device_id
    AND score_date = p_date;

  IF v_features.id IS NULL THEN
    PERFORM public.compute_vehicle_health_features_day(p_device_id, p_date);

    SELECT * INTO v_features
    FROM public.vehicle_health_features_daily
    WHERE device_id = p_device_id
      AND score_date = p_date;
  END IF;

  IF v_features.id IS NULL THEN
    RAISE EXCEPTION 'No features found for device % on %', p_device_id, p_date;
  END IF;

  v_connectivity_score := GREATEST(0, 100 - LEAST(
    70,
    (v_features.offline_event_count * 8)::NUMERIC +
    (GREATEST(v_features.max_gap_minutes - 30, 0) * 0.25)
  )::INTEGER);

  v_safety_score := GREATEST(0, 100 - LEAST(
    75,
    (v_features.harsh_event_count * 4)::NUMERIC +
    (v_features.overspeed_event_count * 3)::NUMERIC +
    (v_features.speeding_exposure_pct * 0.5)
  )::INTEGER);

  v_utilization_score := GREATEST(0, 100 - LEAST(
    65,
    (v_features.idle_minutes * 0.15) +
    (v_features.idle_event_count * 2)::NUMERIC +
    (GREATEST(v_features.distance_km - 400, 0) * 0.05)
  )::INTEGER);

  v_data_quality_score := GREATEST(0, 100 - LEAST(
    85,
    (v_features.impossible_jump_count * 12)::NUMERIC +
    ((v_features.gps_drift_ratio * 100) * 0.7) +
    (CASE WHEN v_features.low_sample_day THEN 20 ELSE 0 END) +
    ((100 - v_features.data_completeness_pct) * 0.5)
  )::INTEGER);

  v_raw_health :=
    (v_connectivity_score * 0.35) +
    (v_safety_score * 0.30) +
    (v_utilization_score * 0.20) +
    (v_data_quality_score * 0.15);

  IF v_features.max_gap_minutes >= 240 THEN
    v_raw_health := v_raw_health - 10;
  END IF;

  IF v_features.impossible_jump_count >= 3 THEN
    v_raw_health := v_raw_health - 15;
  END IF;

  IF v_features.speeding_exposure_pct >= 20 THEN
    v_raw_health := v_raw_health - 10;
  END IF;

  v_health_score := GREATEST(0, LEAST(100, ROUND(v_raw_health)::INTEGER));

  v_confidence_score := GREATEST(0, LEAST(
    100,
    ROUND(
      (v_features.data_completeness_pct * 0.7) +
      ((100 - LEAST(100, (v_features.impossible_jump_count * 15) + ((v_features.gps_drift_ratio * 100) * 40))) * 0.3)
    )::INTEGER
  ));

  IF v_confidence_score < 35 THEN
    v_health_score := LEAST(v_health_score, 75);
  ELSIF v_confidence_score < 50 THEN
    v_health_score := LEAST(v_health_score, 85);
  END IF;

  SELECT vhd.health_score INTO v_previous_score
  FROM public.vehicle_health_daily vhd
  WHERE vhd.device_id = p_device_id
    AND vhd.score_date < p_date
  ORDER BY vhd.score_date DESC
  LIMIT 1;

  IF v_previous_score IS NOT NULL THEN
    IF v_health_score - v_previous_score >= 8 THEN
      v_trend := 'improving';
    ELSIF v_health_score - v_previous_score <= -8 THEN
      v_trend := 'declining';
    ELSE
      v_trend := 'stable';
    END IF;

  END IF;

  IF v_health_score < 40 THEN
    v_trend := 'critical';
  END IF;

  INSERT INTO public.vehicle_health_daily (
    device_id,
    score_date,
    health_score,
    confidence_score,
    trend,
    component_scores,
    feature_snapshot,
    model_version,
    updated_at
  ) VALUES (
    p_device_id,
    p_date,
    v_health_score,
    v_confidence_score,
    v_trend,
    jsonb_build_object(
      'connectivity_score', v_connectivity_score,
      'safety_score', v_safety_score,
      'utilization_score', v_utilization_score,
      'data_quality_score', v_data_quality_score
    ),
    jsonb_build_object(
      'points_count', v_features.points_count,
      'trip_count', v_features.trip_count,
      'distance_km', v_features.distance_km,
      'moving_minutes', v_features.moving_minutes,
      'idle_minutes', v_features.idle_minutes,
      'idle_event_count', v_features.idle_event_count,
      'overspeed_event_count', v_features.overspeed_event_count,
      'harsh_event_count', v_features.harsh_event_count,
      'offline_event_count', v_features.offline_event_count,
      'speeding_exposure_pct', v_features.speeding_exposure_pct,
      'max_gap_minutes', v_features.max_gap_minutes,
      'impossible_jump_count', v_features.impossible_jump_count,
      'gps_drift_ratio', v_features.gps_drift_ratio,
      'avg_battery_percent', v_features.avg_battery_percent,
      'min_battery_percent', v_features.min_battery_percent,
      'data_completeness_pct', v_features.data_completeness_pct,
      'low_sample_day', v_features.low_sample_day
    ),
    'daily-gps-health-v1',
    now()
  )
  ON CONFLICT (device_id, score_date)
  DO UPDATE SET
    health_score = EXCLUDED.health_score,
    confidence_score = EXCLUDED.confidence_score,
    trend = EXCLUDED.trend,
    component_scores = EXCLUDED.component_scores,
    feature_snapshot = EXCLUDED.feature_snapshot,
    model_version = EXCLUDED.model_version,
    updated_at = now();
END;
$$;

DROP FUNCTION IF EXISTS public.compute_all_vehicle_health_scores_day(DATE);
CREATE OR REPLACE FUNCTION public.compute_all_vehicle_health_scores_day(
  p_date DATE
)
RETURNS TABLE (
  device_id TEXT,
  health_score INTEGER,
  confidence_score INTEGER,
  status TEXT,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device RECORD;
BEGIN
  FOR v_device IN
    SELECT DISTINCT v.device_id
    FROM public.vehicles v
    WHERE EXISTS (
      SELECT 1
      FROM public.position_history ph
      WHERE ph.device_id = v.device_id
        AND ph.gps_time >= p_date::timestamptz
        AND ph.gps_time < (p_date + INTERVAL '1 day')::timestamptz
    )
    OR EXISTS (
      SELECT 1
      FROM public.vehicle_trips vt
      WHERE vt.device_id = v.device_id
        AND vt.start_time >= p_date::timestamptz
        AND vt.start_time < (p_date + INTERVAL '1 day')::timestamptz
    )
    OR EXISTS (
      SELECT 1
      FROM public.proactive_vehicle_events pve
      WHERE pve.device_id = v.device_id
        AND pve.created_at >= p_date::timestamptz
        AND pve.created_at < (p_date + INTERVAL '1 day')::timestamptz
    )
  LOOP
    BEGIN
      PERFORM public.compute_vehicle_health_features_day(v_device.device_id, p_date);
      PERFORM public.compute_vehicle_health_score_day(v_device.device_id, p_date);

      RETURN QUERY
      SELECT
        v_device.device_id,
        vhd.health_score,
        vhd.confidence_score,
        'success'::TEXT,
        NULL::TEXT
      FROM public.vehicle_health_daily vhd
      WHERE vhd.device_id = v_device.device_id
        AND vhd.score_date = p_date
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY
      SELECT
        v_device.device_id,
        NULL::INTEGER,
        NULL::INTEGER,
        'failed'::TEXT,
        SQLERRM;
    END;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.get_vehicle_health_daily(TEXT, DATE, DATE);
CREATE OR REPLACE FUNCTION public.get_vehicle_health_daily(
  p_device_id TEXT,
  p_start_date DATE DEFAULT (CURRENT_DATE - 30),
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  score_date DATE,
  health_score INTEGER,
  confidence_score INTEGER,
  trend TEXT,
  component_scores JSONB,
  feature_snapshot JSONB,
  model_version TEXT,
  active_recommendations INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vhd.score_date,
    vhd.health_score,
    vhd.confidence_score,
    vhd.trend,
    vhd.component_scores,
    vhd.feature_snapshot,
    vhd.model_version,
    (
      SELECT COUNT(*)::INTEGER
      FROM public.maintenance_recommendations mr
      WHERE mr.device_id = p_device_id
        AND mr.status = 'active'
    ) AS active_recommendations
  FROM public.vehicle_health_daily vhd
  WHERE vhd.device_id = p_device_id
    AND vhd.score_date >= p_start_date
    AND vhd.score_date <= p_end_date
  ORDER BY vhd.score_date DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_vehicle_health_recent_window(
  p_device_id TEXT,
  p_end_date DATE DEFAULT CURRENT_DATE,
  p_days_back INTEGER DEFAULT 2
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i INTEGER;
  v_date DATE;
BEGIN
  FOR i IN 0..GREATEST(p_days_back, 0) LOOP
    v_date := p_end_date - i;
    PERFORM public.compute_vehicle_health_features_day(p_device_id, v_date);
    PERFORM public.compute_vehicle_health_score_day(p_device_id, v_date);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_vehicle_health_daily(
  p_days_back INTEGER DEFAULT 30,
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  score_date DATE,
  success_count INTEGER,
  failed_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i INTEGER;
  v_date DATE;
BEGIN
  FOR i IN REVERSE 0..GREATEST(p_days_back, 0) LOOP
    v_date := p_end_date - i;

    RETURN QUERY
    WITH per_device AS (
      SELECT * FROM public.compute_all_vehicle_health_scores_day(v_date)
    )
    SELECT
      v_date,
      COUNT(*) FILTER (WHERE status = 'success')::INTEGER,
      COUNT(*) FILTER (WHERE status = 'failed')::INTEGER
    FROM per_device;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_daily_health_on_proactive_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at >= now() - INTERVAL '3 days' THEN
    PERFORM public.recompute_vehicle_health_recent_window(NEW.device_id, NEW.created_at::date, 2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_recompute_daily_health_on_proactive_event ON public.proactive_vehicle_events;
CREATE TRIGGER trigger_recompute_daily_health_on_proactive_event
AFTER INSERT ON public.proactive_vehicle_events
FOR EACH ROW
EXECUTE FUNCTION public.recompute_daily_health_on_proactive_event();

GRANT EXECUTE ON FUNCTION public.compute_vehicle_health_features_day(TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_vehicle_health_score_day(TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_all_vehicle_health_scores_day(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_vehicle_health_daily(TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_vehicle_health_recent_window(TEXT, DATE, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backfill_vehicle_health_daily(INTEGER, DATE) TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-vehicle-health-prev-day');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'daily-vehicle-health-prev-day',
  '20 0 * * *',
  $$SELECT public.compute_all_vehicle_health_scores_day((CURRENT_DATE - 1));$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('daily-vehicle-health-late-window');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'daily-vehicle-health-late-window',
  '0 2 * * *',
  $$SELECT public.compute_all_vehicle_health_scores_day((CURRENT_DATE - 2));$$
);

COMMENT ON TABLE public.vehicle_health_features_daily IS 'Daily GPS-derived feature vectors used for vehicle health scoring';
COMMENT ON TABLE public.vehicle_health_daily IS 'Canonical daily vehicle health and confidence scores';
COMMENT ON FUNCTION public.compute_vehicle_health_features_day IS 'Computes daily GPS/event/trip feature aggregation for a vehicle';
COMMENT ON FUNCTION public.compute_vehicle_health_score_day IS 'Computes reliability-first daily health and confidence score from daily features';
COMMENT ON FUNCTION public.compute_all_vehicle_health_scores_day IS 'Computes daily health scores for every vehicle with telemetry/event/trip activity';
COMMENT ON FUNCTION public.get_vehicle_health_daily IS 'Returns canonical daily health score history for a vehicle';
COMMENT ON FUNCTION public.recompute_vehicle_health_recent_window IS 'Recomputes daily health for recent window to account for late-arriving telemetry';
COMMENT ON FUNCTION public.backfill_vehicle_health_daily IS 'Backfills canonical daily health scores for all active devices over a date range';
COMMENT ON FUNCTION public.recompute_daily_health_on_proactive_event IS 'Recomputes recent daily health window when a new proactive event is written';
