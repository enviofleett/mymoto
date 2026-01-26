-- Verify Both CRON Jobs: GPS Location Sync & Trip Sync
-- This confirms both jobs are configured correctly

-- ============================================================================
-- 1. GPS LOCATION SYNC (sync-gps-data) - Refreshes LIVE LOCATION
-- ============================================================================
-- This should run every 60 seconds to update vehicle_positions table
SELECT 
  'GPS Location Sync' as job_type,
  jobname,
  schedule,
  active,
  CASE 
    WHEN schedule = '*/1 * * * *' THEN '✅ EVERY 60 SECONDS (1 minute)'
    WHEN schedule = '0,15,30,45 * * * *' THEN '⚠️ EVERY 15 MINUTES (old)'
    ELSE '❓ ' || schedule
  END as schedule_status,
  CASE 
    WHEN active THEN '✅ ACTIVE'
    ELSE '❌ INACTIVE'
  END as active_status
FROM cron.job
WHERE jobname = 'sync-gps-data';

-- Recent GPS sync runs
SELECT 
  'GPS Location Sync' as job_type,
  runid,
  status,
  start_time,
  CASE 
    WHEN status = 'succeeded' THEN '✅ SUCCESS'
    WHEN status = 'failed' THEN '❌ FAILED'
    ELSE '⏳ ' || status
  END as status_display,
  LEFT(return_message, 100) as message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
ORDER BY start_time DESC
LIMIT 5;

-- ============================================================================
-- 2. TRIP SYNC (auto-sync-trips-staggered) - Refreshes TRIP REPORTS
-- ============================================================================
-- This should run every 15 minutes to update vehicle_trips table
SELECT 
  'Trip Sync' as job_type,
  jobname,
  schedule,
  active,
  CASE 
    WHEN schedule = '5,20,35,50 * * * *' THEN '✅ EVERY 15 MINUTES (staggered)'
    WHEN schedule = '*/15 * * * *' THEN '✅ EVERY 15 MINUTES'
    ELSE '❓ ' || schedule
  END as schedule_status,
  CASE 
    WHEN active THEN '✅ ACTIVE'
    ELSE '❌ INACTIVE'
  END as active_status
FROM cron.job
WHERE jobname = 'auto-sync-trips-staggered';

-- Recent trip sync runs
SELECT 
  'Trip Sync' as job_type,
  runid,
  status,
  start_time,
  CASE 
    WHEN status = 'succeeded' THEN '✅ SUCCESS'
    WHEN status = 'failed' THEN '❌ FAILED'
    ELSE '⏳ ' || status
  END as status_display,
  LEFT(return_message, 100) as message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-sync-trips-staggered')
ORDER BY start_time DESC
LIMIT 5;

-- ============================================================================
-- 3. CHECK YOUR DEVICE DATA FRESHNESS
-- ============================================================================
SELECT 
  'Live Location Data' as data_type,
  device_id,
  gps_time as last_gps_update,
  last_synced_at as last_location_sync,
  EXTRACT(EPOCH FROM (NOW() - last_synced_at)) / 60 as minutes_since_location_sync,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - last_synced_at) / 60) < 2 THEN '✅ VERY FRESH (< 2 min)'
    WHEN EXTRACT(EPOCH FROM (NOW() - last_synced_at) / 60) < 5 THEN '✅ FRESH (< 5 min)'
    ELSE '⚠️ STALE'
  END as location_freshness
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- Check trip sync status (this is what shows "Last synced: 5 days ago")
SELECT 
  'Trip Sync Status' as data_type,
  device_id,
  last_sync_at as last_trip_sync,
  sync_status,
  trips_processed,
  EXTRACT(EPOCH FROM (NOW() - last_sync_at::timestamp)) / 86400 as days_since_trip_sync,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - last_sync_at::timestamp) / 86400) < 1 THEN '✅ FRESH (< 1 day)'
    WHEN EXTRACT(EPOCH FROM (NOW() - last_sync_at::timestamp) / 86400) < 7 THEN '⚠️ STALE (1-7 days)'
    ELSE '❌ VERY STALE (> 7 days)'
  END as trip_sync_freshness
FROM trip_sync_status
WHERE device_id = '358657105966092';

-- ============================================================================
-- 4. SUMMARY
-- ============================================================================
SELECT 
  'SUMMARY' as check_type,
  CASE 
    WHEN (SELECT schedule FROM cron.job WHERE jobname = 'sync-gps-data') = '*/1 * * * *'
         AND (SELECT active FROM cron.job WHERE jobname = 'sync-gps-data') = true
    THEN '✅ GPS Location Sync: Set to 60 seconds, ACTIVE'
    ELSE '❌ GPS Location Sync: NOT configured correctly'
  END as gps_sync_status,
  CASE 
    WHEN (SELECT active FROM cron.job WHERE jobname = 'auto-sync-trips-staggered') = true
    THEN '✅ Trip Sync: ACTIVE (every 15 minutes)'
    ELSE '❌ Trip Sync: NOT active'
  END as trip_sync_status;
