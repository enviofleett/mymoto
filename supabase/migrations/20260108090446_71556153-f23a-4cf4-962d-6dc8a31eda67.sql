-- Create RPC function for aggregated fleet statistics
-- This runs on the database server, avoiding Edge Function memory overhead

CREATE OR REPLACE FUNCTION get_fleet_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_count int;
  online_count int;
  offline_count int;
  moving_count int;
  low_battery_count int;
  overspeeding_count int;
  unassigned_count int;
  avg_speed numeric;
  avg_battery numeric;
  low_battery_details jsonb;
  overspeeding_details jsonb;
BEGIN
  -- Total vehicles
  SELECT count(*) INTO total_count FROM vehicles;
  
  -- Online vehicles (from vehicle_positions)
  SELECT count(*) INTO online_count FROM vehicle_positions WHERE is_online = true;
  offline_count := total_count - online_count;
  
  -- Moving vehicles (speed > 0)
  SELECT count(*) INTO moving_count FROM vehicle_positions WHERE speed > 0;
  
  -- Low battery vehicles (< 20%)
  SELECT count(*) INTO low_battery_count 
  FROM vehicle_positions 
  WHERE battery_percent IS NOT NULL AND battery_percent > 0 AND battery_percent < 20;
  
  -- Overspeeding vehicles
  SELECT count(*) INTO overspeeding_count FROM vehicle_positions WHERE is_overspeeding = true;
  
  -- Unassigned vehicles (no profile_id in assignment)
  SELECT count(*) INTO unassigned_count
  FROM vehicles v
  WHERE NOT EXISTS (
    SELECT 1 FROM vehicle_assignments va 
    WHERE va.device_id = v.device_id AND va.profile_id IS NOT NULL
  );
  
  -- Average speed (for moving vehicles)
  SELECT COALESCE(AVG(speed), 0) INTO avg_speed 
  FROM vehicle_positions 
  WHERE speed > 0;
  
  -- Average battery (for vehicles with battery data)
  SELECT COALESCE(AVG(battery_percent), 0) INTO avg_battery 
  FROM vehicle_positions 
  WHERE battery_percent IS NOT NULL AND battery_percent > 0;
  
  -- Low battery details (top 5)
  SELECT COALESCE(jsonb_agg(lb), '[]'::jsonb) INTO low_battery_details
  FROM (
    SELECT 
      COALESCE(va.vehicle_alias, v.device_name, vp.device_id) as name,
      vp.battery_percent as battery
    FROM vehicle_positions vp
    LEFT JOIN vehicles v ON v.device_id = vp.device_id
    LEFT JOIN vehicle_assignments va ON va.device_id = vp.device_id
    WHERE vp.battery_percent IS NOT NULL AND vp.battery_percent > 0 AND vp.battery_percent < 20
    ORDER BY vp.battery_percent ASC
    LIMIT 5
  ) lb;
  
  -- Overspeeding details (top 5)
  SELECT COALESCE(jsonb_agg(os), '[]'::jsonb) INTO overspeeding_details
  FROM (
    SELECT 
      COALESCE(va.vehicle_alias, v.device_name, vp.device_id) as name,
      vp.speed
    FROM vehicle_positions vp
    LEFT JOIN vehicles v ON v.device_id = vp.device_id
    LEFT JOIN vehicle_assignments va ON va.device_id = vp.device_id
    WHERE vp.is_overspeeding = true
    ORDER BY vp.speed DESC
    LIMIT 5
  ) os;
  
  RETURN json_build_object(
    'total', total_count,
    'online', online_count,
    'offline', offline_count,
    'moving', moving_count,
    'low_battery', low_battery_count,
    'overspeeding', overspeeding_count,
    'unassigned', unassigned_count,
    'avg_speed', ROUND(avg_speed::numeric, 1),
    'avg_battery', ROUND(avg_battery::numeric, 0),
    'low_battery_details', low_battery_details,
    'overspeeding_details', overspeeding_details
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_fleet_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_fleet_stats() TO service_role;