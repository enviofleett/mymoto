-- Debug: Find the 2 vehicles with speeds > 200 in NEW data
SELECT 
  device_id,
  speed,
  cached_at,
  NOW() - cached_at as age_seconds,
  'Check if this is m/h or km/h' as note
FROM vehicle_positions
WHERE speed > 200 
  AND cached_at >= NOW() - INTERVAL '5 minutes'
ORDER BY speed DESC;

-- Check if these speeds are in m/h (should be > 1000) or if they're edge cases
-- If speed is 300, it could be:
-- - 300 m/h (should normalize to 0.3 km/h → becomes 0 due to threshold)
-- - 300 km/h (valid but very fast - but normalizer should have caught this)
-- - 300000 m/h (should normalize to 300 km/h - valid)


