-- Debug Queries for Vehicle Command Logs
-- Run these in Supabase SQL Editor to troubleshoot "No rows returned"

-- ====================================================
-- 1. Check if table exists and structure is correct
-- ====================================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vehicle_command_logs'
ORDER BY ordinal_position;

-- ====================================================
-- 2. Check ALL command logs (no filter)
-- ====================================================
SELECT 
  id,
  device_id,
  command_type,
  status,
  created_at,
  executed_at,
  user_id,
  result,
  error_message
FROM vehicle_command_logs
ORDER BY created_at DESC
LIMIT 20;

-- ====================================================
-- 3. Check recent commands by device_id (replace YOUR_DEVICE_ID)
-- ====================================================
SELECT 
  id,
  device_id,
  command_type,
  status,
  created_at,
  executed_at,
  result,
  error_message,
  requires_confirmation,
  confirmed_at
FROM vehicle_command_logs
WHERE device_id = 'YOUR_DEVICE_ID'  -- Replace with actual device_id
ORDER BY created_at DESC
LIMIT 10;

-- ====================================================
-- 4. Check RLS policies on vehicle_command_logs
-- ====================================================
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'vehicle_command_logs'
  AND schemaname = 'public';

-- ====================================================
-- 5. Test INSERT permission (replace values)
-- ====================================================
-- This will test if INSERT works (it should, but let's verify)
-- Note: This is a test - delete it after checking

INSERT INTO vehicle_command_logs (
  device_id,
  user_id,
  command_type,
  status,
  payload
) VALUES (
  'TEST_DEVICE',
  auth.uid(),  -- Current user's ID
  'test_command',
  'pending',
  '{}'::jsonb
)
RETURNING *;

-- Delete test record
-- DELETE FROM vehicle_command_logs WHERE device_id = 'TEST_DEVICE' AND command_type = 'test_command';

-- ====================================================
-- 6. Check Edge Function logs (via Supabase Dashboard)
-- ====================================================
-- Go to: Edge Functions > execute-vehicle-command > Logs
-- Look for:
--   - "[Command] Received: ..."
--   - "[Command] Logged command ..."
--   - "[Command] Execution complete ..."
--   - "[Command] Failed to log command: ..."

-- ====================================================
-- 7. Check for specific command types
-- ====================================================
SELECT 
  command_type,
  COUNT(*) as count,
  COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
  MAX(created_at) as most_recent
FROM vehicle_command_logs
GROUP BY command_type
ORDER BY most_recent DESC;

-- ====================================================
-- 8. Check commands by your user_id
-- ====================================================
-- Replace YOUR_USER_ID with your actual user UUID
SELECT 
  id,
  device_id,
  command_type,
  status,
  created_at,
  executed_at,
  result,
  error_message
FROM vehicle_command_logs
WHERE user_id = 'YOUR_USER_ID'  -- Get your user_id from: SELECT id FROM auth.users WHERE email = 'your@email.com';
ORDER BY created_at DESC
LIMIT 10;

-- ====================================================
-- 9. Count all records (verify table is not empty)
-- ====================================================
SELECT 
  COUNT(*) as total_commands,
  COUNT(DISTINCT device_id) as unique_devices,
  COUNT(DISTINCT user_id) as unique_users,
  MIN(created_at) as oldest_command,
  MAX(created_at) as newest_command
FROM vehicle_command_logs;

-- ====================================================
-- 10. Find your actual device_id (if unsure)
-- ====================================================
SELECT 
  device_id,
  device_name,
  is_online,
  last_update
FROM vehicles
ORDER BY last_update DESC
LIMIT 10;

-- ====================================================
-- 11. Check if command execution failed before logging
-- ====================================================
-- Common causes:
-- 1. Authentication failure (401)
-- 2. Permission denied (403) 
-- 3. Missing device_id or command_type (400)
-- 4. Table doesn't exist (500)
-- 5. RLS policy blocks INSERT (42501)

-- Check Edge Function logs in Supabase Dashboard for these errors

-- ====================================================
-- TROUBLESHOOTING GUIDE
-- ====================================================
/*
If you get "No rows returned":

1. **Check Query 2** - Are there ANY records in the table?
   - If NO: Commands are not being logged (check Edge Function logs)
   - If YES: Your WHERE clause might be wrong

2. **Check Query 3** - Are you using the correct device_id?
   - Run Query 10 to find available device_ids
   - Verify device_id matches exactly (case-sensitive)

3. **Check Query 9** - Total count is 0?
   - Commands aren't being executed/logged
   - Check Edge Function logs for errors
   - Verify RLS policies allow INSERT

4. **Check RLS Policies (Query 4)**
   - Should see "Authenticated users can read command logs"
   - If missing, you need admin to add it

5. **Check Edge Function Logs**
   - Supabase Dashboard > Edge Functions > execute-vehicle-command > Logs
   - Look for: "[Command] Logged command..." messages
   - If not present, command never reached the logging step

6. **Test INSERT (Query 5)**
   - If this fails, RLS or permissions issue
   - If this works, INSERT is fine - issue is with Edge Function

Common Issues:
- Wrong device_id in WHERE clause
- Commands executed before migration was applied
- Edge Function error before logging (check logs)
- RLS policy blocking your SELECT (less likely, policy uses USING (true))
*/
