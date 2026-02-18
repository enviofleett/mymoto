CREATE OR REPLACE VIEW public.v_vehicle_hibernation_stats AS
SELECT
  COUNT(*) AS total_vehicles,
  COUNT(*) FILTER (WHERE vehicle_status = 'active') AS active_vehicles,
  COUNT(*) FILTER (WHERE vehicle_status = 'hibernated') AS hibernated_vehicles,
  ROUND(
    CASE WHEN COUNT(*) > 0
      THEN (COUNT(*) FILTER (WHERE vehicle_status = 'hibernated') * 100.0 / COUNT(*))
      ELSE 0
    END::numeric,
    1
  ) AS hibernated_percent,
  COALESCE(
    ROUND(
      AVG(
        EXTRACT(EPOCH FROM (now() - last_online_at)) / 86400.0
      ) FILTER (WHERE vehicle_status = 'hibernated' AND last_online_at IS NOT NULL),
      1
    ),
    0
  ) AS avg_days_offline_hibernated,
  MAX(hibernated_at) AS last_hibernated_at,
  MAX(last_online_at) FILTER (WHERE vehicle_status = 'hibernated') AS last_online_any_hibernated
FROM public.vehicles;

