-- Set Lagos Timezone (Clean Version)
SET timezone = 'Africa/Lagos';

-- Verify
SHOW timezone;

-- Test
SELECT 
  NOW() as current_time,
  NOW() AT TIME ZONE 'Africa/Lagos' as lagos_time;
