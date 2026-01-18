-- Fix Vehicle Assignments for Test Device
-- The test script has vehicle_assignments commented out
-- This is required for the edge function to create chat messages

-- Step 1: Get a user_id (replace with actual user if needed)
DO $$
DECLARE
  test_user_id UUID;
  test_profile_id UUID;
BEGIN
  -- Get first user (or replace with specific user_id)
  SELECT id INTO test_user_id FROM auth.users LIMIT 1;
  
  IF test_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in auth.users table';
  END IF;
  
  -- Get or create profile for this user
  SELECT id INTO test_profile_id 
  FROM profiles 
  WHERE user_id = test_user_id 
  LIMIT 1;
  
  -- If no profile exists, create one
  IF test_profile_id IS NULL THEN
    INSERT INTO profiles (user_id, full_name)
    VALUES (test_user_id, 'Test User')
    RETURNING id INTO test_profile_id;
  END IF;
  
  -- Create vehicle assignment
  INSERT INTO vehicle_assignments (device_id, profile_id)
  VALUES ('TEST_DEVICE_001', test_profile_id)
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Vehicle assignment created: device_id=TEST_DEVICE_001, profile_id=%, user_id=%', 
    test_profile_id, test_user_id;
END $$;

-- Verify assignment was created
SELECT 
  'ASSIGNMENT CHECK' as status,
  va.device_id,
  va.profile_id,
  p.user_id,
  u.email
FROM vehicle_assignments va
JOIN profiles p ON p.id = va.profile_id
JOIN auth.users u ON u.id = p.user_id
WHERE va.device_id = 'TEST_DEVICE_001';
