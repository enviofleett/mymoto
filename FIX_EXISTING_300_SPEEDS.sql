-- Fix existing records with speeds between 200-1000 (definitely m/h)
-- These should be normalized: divide by 1000, then apply 3 km/h threshold

UPDATE vehicle_positions
SET 
  speed = CASE 
    WHEN speed > 200 AND speed < 1000 THEN 
      -- Normalize m/h to km/h, then apply threshold
      CASE 
        WHEN (speed / 1000.0) < 3 THEN 0  -- Below threshold = stationary
        ELSE LEAST((speed / 1000.0), 300)  -- Normalize and clamp to 300 km/h max
      END
    ELSE speed  -- Keep as is if already normalized or > 1000 (will be handled by normalizer)
  END,
  cached_at = cached_at  -- Touch cached_at to mark as updated
WHERE speed > 200 AND speed < 1000;

-- Verify the fix
SELECT 
  'After Fix' as status,
  COUNT(*) FILTER (WHERE speed > 200 AND speed < 1000) as remaining_mh_speeds,
  COUNT(*) FILTER (WHERE speed > 0 AND speed <= 200) as normalized_speeds,
  MAX(speed) as max_speed
FROM vehicle_positions;

-- Show the specific vehicles that were fixed
SELECT 
  device_id,
  speed as new_speed,
  'Fixed: 300 m/h → normalized' as status
FROM vehicle_positions
WHERE device_id IN ('13612332128', '13612332561');


