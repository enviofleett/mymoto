-- ============================================================================
-- TRIGGER GPS SYNC TO FIX BAD TIMESTAMPS
-- ============================================================================
-- This script helps you manually trigger a GPS sync to fix devices with
-- bad timestamps (like year 0165) after deploying the new timestamp parser.
--
-- IMPORTANT: Make sure you've:
-- 1. Applied migration: 20260125000023_add_gps51_timestamp_fields.sql
-- 2. Redeployed the gps-data Edge Function
-- ============================================================================

-- Option 1: Wait for automatic cron (runs every 5 minutes)
-- The 'sync-gps-data' cron job will automatically process all devices.
-- Check if the cron job exists and is active:
SELECT 
  jobid, 
  schedule, 
  active,
  jobname
FROM cron.job 
WHERE jobname = 'sync-gps-data';

-- Option 2: Manually trigger via Supabase Dashboard
-- Go to: Edge Functions > gps-data > Invoke
-- Body: {"action": "lastposition", "use_cache": false}

-- Option 3: Verify the fix after next sync
-- Run this AFTER the Edge Function processes the device:

SELECT 
  device_id,
  gps_time,
  gps_fix_time,
  location_source,
  gps_valid_num,
  last_synced_at,
  CASE 
    WHEN gps_time < '2000-01-01' THEN '❌ BAD (old data - needs sync)'
    WHEN gps_time > now() + interval '5 minutes' THEN '❌ BAD (future)'
    WHEN gps_time IS NULL THEN '⚠️ NULL'
    ELSE '✅ OK'
  END as gps_time_status,
  CASE
    WHEN gps_fix_time IS NOT NULL THEN '✅ Has GPS fix'
    WHEN location_source = 'gps' THEN '⚠️ GPS source but no fix time'
    WHEN location_source IN ('wifi', 'cell') THEN 'ℹ️ LBS/WiFi (no GPS fix expected)'
    ELSE '❓ Unknown'
  END as gps_fix_status
FROM public.vehicle_positions
WHERE device_id = '358657105480144';

-- Expected results AFTER fix:
-- ✅ gps_time = recent timestamp (from GPS51 updatetime/arrivedtime)
-- ✅ gps_time_status = 'OK'
-- ✅ gps_fix_time = null or valid GPS fix time (from validpoistiontime)
-- ✅ location_source = 'gps' | 'wifi' | 'cell' | null
-- ✅ gps_valid_num = satellite count (if available)

-- ============================================================================
-- CHECK ALL DEVICES WITH BAD TIMESTAMPS
-- ============================================================================
SELECT 
  device_id,
  gps_time,
  last_synced_at,
  CASE 
    WHEN gps_time < '2000-01-01' THEN 'Year < 2000'
    WHEN gps_time > now() + interval '5 minutes' THEN 'Future time'
    ELSE 'OK'
  END as issue
FROM public.vehicle_positions
WHERE gps_time < '2000-01-01' 
   OR gps_time > now() + interval '5 minutes'
ORDER BY last_synced_at DESC
LIMIT 20;
