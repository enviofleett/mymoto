-- Set timezone and verify (fast - no table scans)
SET timezone = 'Africa/Lagos';

-- Verify
SHOW timezone;

-- Test conversion
SELECT 
  NOW() as current_time,
  NOW() AT TIME ZONE 'Africa/Lagos' as lagos_time;
