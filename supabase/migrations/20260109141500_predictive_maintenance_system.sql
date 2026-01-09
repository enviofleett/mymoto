-- Predictive Maintenance Automation System
-- Automatically triggers health calculations and maintenance predictions

-- Function to auto-calculate health on significant events
CREATE OR REPLACE FUNCTION auto_calculate_health_on_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only calculate health for significant events
  IF NEW.severity IN ('warning', 'error', 'critical') THEN
    -- Asynchronously calculate health (won't block the insert)
    PERFORM calculate_vehicle_health(NEW.device_id);

    RAISE NOTICE 'Triggered health calculation for device % due to % event', NEW.device_id, NEW.event_type;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on proactive events
CREATE TRIGGER calculate_health_on_critical_event
AFTER INSERT ON proactive_vehicle_events
FOR EACH ROW
EXECUTE FUNCTION auto_calculate_health_on_event();

-- Function to periodically calculate health for all vehicles
CREATE OR REPLACE FUNCTION calculate_all_vehicles_health()
RETURNS TABLE (
  device_id TEXT,
  health_score INTEGER,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  vehicle_record RECORD;
  calculated_count INTEGER := 0;
BEGIN
  FOR vehicle_record IN
    SELECT DISTINCT v.device_id
    FROM vehicles v
    INNER JOIN vehicle_positions vp ON v.device_id = vp.device_id
    WHERE vp.is_online = true OR vp.last_updated >= now() - INTERVAL '24 hours'
    LIMIT 100 -- Process 100 vehicles at a time
  LOOP
    BEGIN
      PERFORM calculate_vehicle_health(vehicle_record.device_id);
      calculated_count := calculated_count + 1;

      RETURN QUERY
      SELECT
        vehicle_record.device_id,
        vhm.overall_health_score,
        'success'::TEXT
      FROM vehicle_health_metrics vhm
      WHERE vhm.device_id = vehicle_record.device_id
      ORDER BY vhm.measured_at DESC
      LIMIT 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to calculate health for device %: %', vehicle_record.device_id, SQLERRM;

      RETURN QUERY
      SELECT
        vehicle_record.device_id,
        NULL::INTEGER,
        'error'::TEXT;
    END;
  END LOOP;

  RAISE NOTICE 'Calculated health for % vehicles', calculated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_all_vehicles_health TO service_role;

-- Function to detect maintenance patterns and predict failures
CREATE OR REPLACE FUNCTION detect_maintenance_patterns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  vehicle_record RECORD;
BEGIN
  -- Detect battery degradation pattern
  FOR vehicle_record IN
    WITH battery_trend AS (
      SELECT
        device_id,
        AVG(battery_health_score) AS avg_score,
        (AVG(battery_health_score) - LAG(AVG(battery_health_score)) OVER (PARTITION BY device_id ORDER BY date_trunc('day', measured_at))) AS daily_change
      FROM vehicle_health_metrics
      WHERE measured_at >= now() - INTERVAL '7 days'
        AND battery_health_score IS NOT NULL
      GROUP BY device_id, date_trunc('day', measured_at)
    )
    SELECT
      device_id,
      AVG(avg_score) AS avg_battery_score,
      AVG(daily_change) AS avg_daily_decline
    FROM battery_trend
    GROUP BY device_id
    HAVING AVG(daily_change) < -2 -- Declining by 2+ points per day
  LOOP
    -- Create urgent maintenance recommendation
    DECLARE
      estimated_days INTEGER;
    BEGIN
      -- Estimate days until critical failure (score < 30)
      estimated_days := GREATEST(
        ((vehicle_record.avg_battery_score - 30) / ABS(vehicle_record.avg_daily_decline))::INTEGER,
        1
      );

      INSERT INTO maintenance_recommendations (
        device_id,
        title,
        description,
        recommendation_type,
        priority,
        predicted_issue,
        confidence_score,
        estimated_days_until_failure,
        trigger_metric,
        current_value,
        supporting_data,
        status,
        expires_at
      ) VALUES (
        vehicle_record.device_id,
        'Battery Degradation Detected',
        format('Battery health declining at %.1f points per day. Estimated failure in %s days.',
               ABS(vehicle_record.avg_daily_decline), estimated_days),
        'battery',
        CASE
          WHEN estimated_days <= 3 THEN 'urgent'::maintenance_priority
          WHEN estimated_days <= 7 THEN 'high'::maintenance_priority
          ELSE 'medium'::maintenance_priority
        END,
        'Battery failure imminent based on declining health trend',
        0.85,
        estimated_days,
        'battery_health_trend',
        vehicle_record.avg_battery_score,
        jsonb_build_object(
          'avg_daily_decline', vehicle_record.avg_daily_decline,
          'estimated_failure_date', (now() + (estimated_days || ' days')::INTERVAL)::TEXT
        ),
        'active',
        now() + INTERVAL '30 days'
      )
      ON CONFLICT DO NOTHING;

      -- Also create a critical proactive event if urgent
      IF estimated_days <= 3 THEN
        INSERT INTO proactive_vehicle_events (
          device_id,
          event_type,
          severity,
          title,
          description,
          metadata
        ) VALUES (
          vehicle_record.device_id,
          'maintenance_due'::event_type,
          'critical'::event_severity,
          'Urgent: Battery Failure Predicted',
          format('Battery health critically declining. Estimated failure in %s days. Immediate inspection required.', estimated_days),
          jsonb_build_object(
            'estimated_days', estimated_days,
            'avg_decline_rate', vehicle_record.avg_daily_decline,
            'current_score', vehicle_record.avg_battery_score
          )
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END;
  END LOOP;

  -- Detect excessive idle time patterns
  FOR vehicle_record IN
    WITH idle_analysis AS (
      SELECT
        device_id,
        COUNT(*) FILTER (WHERE event_type = 'idle_too_long') AS idle_events,
        AVG((metadata->>'idle_minutes')::INTEGER) AS avg_idle_minutes
      FROM proactive_vehicle_events
      WHERE created_at >= now() - INTERVAL '30 days'
        AND event_type = 'idle_too_long'
      GROUP BY device_id
      HAVING COUNT(*) >= 10 -- 10+ idle events in 30 days
    )
    SELECT * FROM idle_analysis
  LOOP
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
      vehicle_record.device_id,
      'Excessive Idling Detected',
      format('Vehicle has idled %s times in the last 30 days (avg %.0f minutes per idle). This increases fuel consumption and engine wear.',
             vehicle_record.idle_events, vehicle_record.avg_idle_minutes),
      'behavior',
      'medium'::maintenance_priority,
      'Increased fuel costs and engine wear from excessive idling',
      0.70,
      'idle_event_count',
      vehicle_record.idle_events,
      'active'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Detect harsh driving patterns
  FOR vehicle_record IN
    WITH harsh_driving AS (
      SELECT
        device_id,
        COUNT(*) FILTER (WHERE event_type IN ('harsh_braking', 'rapid_acceleration', 'overspeeding')) AS harsh_events
      FROM proactive_vehicle_events
      WHERE created_at >= now() - INTERVAL '7 days'
      GROUP BY device_id
      HAVING COUNT(*) FILTER (WHERE event_type IN ('harsh_braking', 'rapid_acceleration', 'overspeeding')) >= 15
    )
    SELECT * FROM harsh_driving
  LOOP
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
      vehicle_record.device_id,
      'Harsh Driving Pattern Detected',
      format('Vehicle experienced %s harsh driving events in the last 7 days. This may lead to premature brake and tire wear.',
             vehicle_record.harsh_events),
      'behavior',
      'high'::maintenance_priority,
      'Accelerated wear on brakes, tires, and suspension',
      0.75,
      'harsh_event_count',
      vehicle_record.harsh_events,
      'active'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION detect_maintenance_patterns TO service_role;

-- Function to acknowledge maintenance recommendation
CREATE OR REPLACE FUNCTION acknowledge_maintenance_recommendation(
  p_recommendation_id UUID,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE maintenance_recommendations
  SET
    status = 'acknowledged',
    acknowledged_at = now(),
    acknowledged_by = p_user_id,
    resolution_notes = COALESCE(p_notes, resolution_notes)
  WHERE id = p_recommendation_id
    AND status = 'active';

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION acknowledge_maintenance_recommendation TO authenticated;

-- Function to resolve maintenance recommendation
CREATE OR REPLACE FUNCTION resolve_maintenance_recommendation(
  p_recommendation_id UUID,
  p_user_id UUID,
  p_notes TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE maintenance_recommendations
  SET
    status = 'resolved',
    resolved_at = now(),
    acknowledged_by = p_user_id,
    resolution_notes = p_notes
  WHERE id = p_recommendation_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_maintenance_recommendation TO authenticated;

-- Function to get health trends
CREATE OR REPLACE FUNCTION get_health_trends(
  p_device_id TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  overall_health_score INTEGER,
  battery_health_score INTEGER,
  driving_behavior_score INTEGER,
  connectivity_score INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(measured_at) AS date,
    AVG(vhm.overall_health_score)::INTEGER AS overall_health_score,
    AVG(vhm.battery_health_score)::INTEGER AS battery_health_score,
    AVG(vhm.driving_behavior_score)::INTEGER AS driving_behavior_score,
    AVG(vhm.connectivity_score)::INTEGER AS connectivity_score
  FROM vehicle_health_metrics vhm
  WHERE vhm.device_id = p_device_id
    AND vhm.measured_at >= now() - (p_days || ' days')::INTERVAL
  GROUP BY DATE(measured_at)
  ORDER BY date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_health_trends TO authenticated;

-- Function to get fleet-wide health summary
CREATE OR REPLACE FUNCTION get_fleet_health_summary()
RETURNS TABLE (
  total_vehicles INTEGER,
  healthy_vehicles INTEGER,
  warning_vehicles INTEGER,
  critical_vehicles INTEGER,
  avg_health_score DECIMAL,
  active_recommendations INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH latest_health AS (
    SELECT DISTINCT ON (device_id)
      device_id,
      overall_health_score
    FROM vehicle_health_metrics
    ORDER BY device_id, measured_at DESC
  )
  SELECT
    COUNT(*)::INTEGER AS total_vehicles,
    COUNT(*) FILTER (WHERE overall_health_score >= 70)::INTEGER AS healthy_vehicles,
    COUNT(*) FILTER (WHERE overall_health_score BETWEEN 40 AND 69)::INTEGER AS warning_vehicles,
    COUNT(*) FILTER (WHERE overall_health_score < 40)::INTEGER AS critical_vehicles,
    AVG(overall_health_score) AS avg_health_score,
    (SELECT COUNT(*)::INTEGER FROM maintenance_recommendations WHERE status = 'active') AS active_recommendations
  FROM latest_health;
END;
$$;

GRANT EXECUTE ON FUNCTION get_fleet_health_summary TO authenticated;

-- Comments
COMMENT ON FUNCTION auto_calculate_health_on_event IS 'Automatically triggers health calculation when critical events occur';
COMMENT ON FUNCTION calculate_all_vehicles_health IS 'Batch calculates health for all active vehicles (use with pg_cron)';
COMMENT ON FUNCTION detect_maintenance_patterns IS 'Analyzes trends to predict maintenance needs before failures occur';
COMMENT ON FUNCTION acknowledge_maintenance_recommendation IS 'Marks a maintenance recommendation as acknowledged';
COMMENT ON FUNCTION resolve_maintenance_recommendation IS 'Marks a maintenance recommendation as resolved with notes';
COMMENT ON FUNCTION get_health_trends IS 'Returns historical health trends for visualization';
COMMENT ON FUNCTION get_fleet_health_summary IS 'Returns fleet-wide health statistics';

-- Note: Schedule these functions with pg_cron:
-- Daily health calculation: SELECT calculate_all_vehicles_health();
-- Hourly pattern detection: SELECT detect_maintenance_patterns();
-- Weekly location frequency update: SELECT update_location_visit_frequency();
