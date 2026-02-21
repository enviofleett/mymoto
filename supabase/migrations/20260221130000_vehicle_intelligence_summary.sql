DROP FUNCTION IF EXISTS public.get_vehicle_intelligence_summary(TEXT);

CREATE OR REPLACE FUNCTION public.get_vehicle_intelligence_summary(
  p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_24h_ago TIMESTAMPTZ := v_now - INTERVAL '24 hours';
  v_7d_ago TIMESTAMPTZ := v_now - INTERVAL '7 days';
  v_14d_ago TIMESTAMPTZ := v_now - INTERVAL '14 days';
  v_total_engine_minutes_24h NUMERIC := 0;
  v_long_haul_trip_count_24h INTEGER := 0;
  v_has_continuous_over_4h BOOLEAN := false;
  v_late_night_trips_7d INTEGER := 0;
  v_idle_minutes_7d NUMERIC := 0;
  v_offline_events_7d INTEGER := 0;
  v_harsh_braking_events_7d INTEGER := 0;
  v_overspeed_events_7d INTEGER := 0;
  v_safety_events_this_week INTEGER := 0;
  v_safety_events_last_week INTEGER := 0;
  v_connectivity_score INTEGER := 100;
  v_fatigue_index INTEGER := 0;
  v_fatigue_level TEXT := 'low';
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.vehicle_assignments va
      JOIN public.profiles p ON p.id = va.profile_id
      WHERE va.device_id = p_device_id
        AND p.user_id = v_user_id
    ) THEN
      RETURN jsonb_build_object(
        'error', 'access_denied',
        'message', 'You do not have access to this vehicle'
      );
    END IF;
  END IF;

  SELECT
    COALESCE(SUM(vt.duration_seconds), 0) / 60.0,
    COUNT(*) FILTER (WHERE COALESCE(vt.duration_seconds, 0) >= 3 * 60 * 60),
    COALESCE(MAX(vt.duration_seconds), 0) >= 4 * 60 * 60
  INTO
    v_total_engine_minutes_24h,
    v_long_haul_trip_count_24h,
    v_has_continuous_over_4h
  FROM public.vehicle_trips vt
  WHERE vt.device_id = p_device_id
    AND vt.start_time >= v_24h_ago
    AND vt.start_time < v_now;

  SELECT
    COUNT(*)::INTEGER
  INTO v_late_night_trips_7d
  FROM public.vehicle_trips vt
  WHERE vt.device_id = p_device_id
    AND vt.start_time >= v_7d_ago
    AND vt.start_time < v_now
    AND (
      (vt.start_time::time >= TIME '23:00')
      OR (vt.start_time::time < TIME '05:00')
    );

  SELECT
    COALESCE(SUM((pve.metadata ->> 'idle_minutes')::NUMERIC), 0)
  INTO v_idle_minutes_7d
  FROM public.proactive_vehicle_events pve
  WHERE pve.device_id = p_device_id
    AND pve.event_type = 'idle_too_long'
    AND pve.created_at >= v_7d_ago
    AND pve.created_at < v_now;

  SELECT
    COUNT(*)::INTEGER
  INTO v_offline_events_7d
  FROM public.proactive_vehicle_events pve
  WHERE pve.device_id = p_device_id
    AND pve.event_type = 'offline'
    AND pve.created_at >= v_7d_ago
    AND pve.created_at < v_now;

  SELECT
    COALESCE(SUM((ta.harsh_events ->> 'harsh_braking')::INTEGER), 0),
    COALESCE(SUM((ta.harsh_events ->> 'total_events')::INTEGER), 0)
  INTO
    v_harsh_braking_events_7d,
    v_safety_events_this_week
  FROM public.trip_analytics ta
  WHERE ta.device_id = p_device_id
    AND ta.analyzed_at >= v_7d_ago
    AND ta.analyzed_at < v_now;

  SELECT
    COALESCE(SUM((ta.harsh_events ->> 'total_events')::INTEGER), 0)
  INTO v_safety_events_last_week
  FROM public.trip_analytics ta
  WHERE ta.device_id = p_device_id
    AND ta.analyzed_at >= v_14d_ago
    AND ta.analyzed_at < v_7d_ago;

  SELECT
    COUNT(*)::INTEGER
  INTO v_overspeed_events_7d
  FROM public.proactive_vehicle_events pve
  WHERE pve.device_id = p_device_id
    AND pve.event_type = 'overspeeding'
    AND pve.created_at >= v_7d_ago
    AND pve.created_at < v_now;

  v_connectivity_score := GREATEST(0, LEAST(100, 100 - v_offline_events_7d * 10));

  v_fatigue_index := 0;

  IF v_total_engine_minutes_24h > 8 * 60 THEN
    v_fatigue_index := v_fatigue_index + LEAST(60, ((v_total_engine_minutes_24h - 8 * 60) / 10)::INTEGER);
  END IF;

  IF v_has_continuous_over_4h THEN
    v_fatigue_index := v_fatigue_index + 30;
  END IF;

  IF v_long_haul_trip_count_24h > 0 THEN
    v_fatigue_index := v_fatigue_index + 10;
  END IF;

  IF v_late_night_trips_7d > 0 THEN
    v_fatigue_index := v_fatigue_index + 5;
  END IF;

  v_fatigue_index := LEAST(100, GREATEST(0, v_fatigue_index));

  IF v_fatigue_index >= 70 THEN
    v_fatigue_level := 'high';
  ELSIF v_fatigue_index >= 30 THEN
    v_fatigue_level := 'moderate';
  ELSE
    v_fatigue_level := 'low';
  END IF;

  RETURN jsonb_build_object(
    'fatigue_index', v_fatigue_index,
    'fatigue_level', v_fatigue_level,
    'total_engine_hours_24h', ROUND(v_total_engine_minutes_24h / 60.0, 2),
    'has_long_haul_24h', v_long_haul_trip_count_24h > 0,
    'late_night_trips_7d', v_late_night_trips_7d,
    'idle_minutes_7d', v_idle_minutes_7d,
    'offline_events_7d', v_offline_events_7d,
    'connectivity_score', v_connectivity_score,
    'hard_braking_events_7d', v_harsh_braking_events_7d,
    'overspeed_events_7d', v_overspeed_events_7d,
    'safety_events_this_week', v_safety_events_this_week,
    'safety_events_last_week', v_safety_events_last_week,
    'updated_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vehicle_intelligence_summary(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vehicle_intelligence_summary(TEXT) TO service_role;
