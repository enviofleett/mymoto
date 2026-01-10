-- Verify RSH128EA Vehicle Assignment
-- Run this in Supabase SQL Editor to confirm the assignment was created

-- Check if the assignment exists
SELECT
  va.device_id,
  va.profile_id,
  va.vehicle_alias,
  va.created_at,
  p.email,
  p.user_id,
  v.device_name,
  v.latitude,
  v.longitude,
  v.status
FROM vehicle_assignments va
JOIN profiles p ON p.id = va.profile_id
JOIN vehicles v ON v.device_id = va.device_id
WHERE va.device_id = '1361282381';

-- Expected Result:
-- device_id: 1361282381
-- profile_id: 8bed4684-0342-4ed3-ad8e-4356fdd70f6e
-- email: makuamadu5@gmail.com
-- device_name: RSH128EA

-- If this returns 1 row, the assignment is successful! ✅
-- User should now be able to see RSH128EA in their Fleet Flow app
