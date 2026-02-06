-- =====================================================
-- 🚨 EMERGENCY FIX & VERIFICATION SCRIPT 🚨
-- Run this script to fix common "NOT READY" blockers
-- =====================================================

-- 1. 🧹 FIX DUPLICATE TRIPS (Safe Deletion)
-- Keeps only the most recent record for any start/end time pair
DELETE FROM vehicle_trips
WHERE id IN (
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (PARTITION BY device_id, start_time, end_time ORDER BY created_at DESC) as rn
    FROM vehicle_trips
    WHERE device_id = '13612333441' -- Target specific device first
  )
  SELECT id
  FROM duplicates
  WHERE rn > 1
);

-- 2. 🔄 RESET STUCK SYNC STATUS
-- Resets any "processing" or "error" status to "idle" to allow re-sync
INSERT INTO trip_sync_status (device_id, sync_status, last_sync_at, error_message)
VALUES ('13612333441', 'idle', NOW(), NULL)
ON CONFLICT (device_id) 
DO UPDATE SET 
  sync_status = 'idle',
  error_message = NULL,
  updated_at = NOW()
WHERE trip_sync_status.sync_status IN ('processing', 'error');

-- 3. 📊 VERIFY FIXES & READINESS
SELECT 
  'FINAL STATUS REPORT' as check_name,
  CASE 
    WHEN (SELECT COUNT(*) FROM vehicle_trips WHERE device_id = '13612333441') = 0 THEN '⚠️ NO DATA - PLEASE CLICK "SYNC TRIPS" IN DASHBOARD'
    WHEN (SELECT COUNT(*) - COUNT(DISTINCT (start_time, end_time)) FROM vehicle_trips WHERE device_id = '13612333441') > 0 THEN '❌ DUPLICATES REMAINING'
    WHEN (SELECT sync_status FROM trip_sync_status WHERE device_id = '13612333441') = 'error' THEN '❌ SYNC ERROR'
    ELSE '✅ READY FOR LIVE'
  END as status;
