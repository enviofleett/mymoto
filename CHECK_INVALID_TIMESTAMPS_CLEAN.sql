-- Quick Check: Do invalid timestamps exist?
SELECT 
  'position_history_future' as check_type,
  EXISTS(
    SELECT 1 FROM position_history 
    WHERE gps_time > NOW() + INTERVAL '1 day'
      AND recorded_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
  ) as has_invalid,
  (SELECT COUNT(*) FROM position_history 
   WHERE gps_time > NOW() + INTERVAL '1 day'
     AND recorded_at >= NOW() - INTERVAL '7 days'
   LIMIT 100) as sample_count

UNION ALL

SELECT 
  'position_history_past' as check_type,
  EXISTS(
    SELECT 1 FROM position_history 
    WHERE gps_time < '2020-01-01'::timestamp
      AND recorded_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
  ) as has_invalid,
  (SELECT COUNT(*) FROM position_history 
   WHERE gps_time < '2020-01-01'::timestamp
     AND recorded_at >= NOW() - INTERVAL '7 days'
   LIMIT 100) as sample_count

UNION ALL

SELECT 
  'vehicle_positions_future' as check_type,
  EXISTS(
    SELECT 1 FROM vehicle_positions 
    WHERE gps_time > NOW() + INTERVAL '1 day'
      AND cached_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
  ) as has_invalid,
  (SELECT COUNT(*) FROM vehicle_positions 
   WHERE gps_time > NOW() + INTERVAL '1 day'
     AND cached_at >= NOW() - INTERVAL '7 days'
   LIMIT 100) as sample_count

UNION ALL

SELECT 
  'vehicle_positions_past' as check_type,
  EXISTS(
    SELECT 1 FROM vehicle_positions 
    WHERE gps_time < '2020-01-01'::timestamp
      AND cached_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
  ) as has_invalid,
  (SELECT COUNT(*) FROM vehicle_positions 
   WHERE gps_time < '2020-01-01'::timestamp
     AND cached_at >= NOW() - INTERVAL '7 days'
   LIMIT 100) as sample_count;
