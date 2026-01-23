-- Verify the cron job was fixed and check what's happening

-- Step 1: Check if cron job exists and what use_cache setting it has
SELECT 
  jobid,
  jobname,
  active,
  -- Extract use_cache value from command
  CASE 
    WHEN command LIKE '%"use_cache"%false%' OR command LIKE '%use_cache%false%' THEN '✅ FALSE (will force updates)'
    WHEN command LIKE '%"use_cache"%true%' OR command LIKE '%use_cache%true%' THEN '❌ TRUE (using cache - prevents updates)'
    WHEN command LIKE '%lastposition%' THEN '⚠️ lastposition found but use_cache not found'
    ELSE '❓ Unknown - check command'
  END as cache_setting,
  -- Show relevant part of command
  substring(
    command, 
    position('use_cache' in command) - 20,
    100
  ) as command_snippet
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- Step 2: Check recent cron job executions
SELECT 
  jobid,
  status,
  return_message,
  start_time,
  end_time,
  EXTRACT(EPOCH FROM (NOW() - start_time)) / 60 AS minutes_ago
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
ORDER BY start_time DESC
LIMIT 5;

-- Step 3: Check if device exists in vehicles table
SELECT 
  device_id,
  device_name,
  last_synced_at,
  EXTRACT(EPOCH FROM (NOW() - last_synced_at)) / 60 AS minutes_since_sync
FROM vehicles
WHERE device_id = '358657105966092';

-- Step 4: Check current position data
SELECT 
  device_id,
  latitude,
  longitude,
  gps_time,
  cached_at,
  is_online,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_ago
FROM vehicle_positions
WHERE device_id = '358657105966092';
