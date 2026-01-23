-- ============================================================================
-- Check Device Assignment for 358657105966092
-- ============================================================================
-- This verifies if the device is assigned to any user profile
-- Realtime updates require proper RLS access
-- ============================================================================

-- Check device assignment
SELECT 
  va.device_id,
  va.profile_id,
  p.name as profile_name,
  p.email as profile_email,
  p.user_id,
  u.email as user_email
FROM vehicle_assignments va
LEFT JOIN profiles p ON p.id = va.profile_id
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE va.device_id = '358657105966092';

-- ============================================================================
-- Check current user's vehicle assignments
-- ============================================================================
-- Run this to see what devices the current user can access
-- (Note: This requires being logged in as a user)

-- For admin users, check all assignments:
SELECT 
  va.device_id,
  va.profile_id,
  p.name as profile_name,
  p.user_id
FROM vehicle_assignments va
LEFT JOIN profiles p ON p.id = va.profile_id
ORDER BY va.device_id;

-- ============================================================================
-- Check RLS policies on vehicle_positions
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'vehicle_positions';

-- Expected: Should see "Authenticated users can read positions" policy
-- ============================================================================
