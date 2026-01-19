-- =====================================================
-- MIGRATION STATUS VERIFICATION
-- Run this to check which migrations are applied
-- =====================================================

-- Check if critical tables and columns exist
SELECT 
  '=== CRITICAL MIGRATIONS ===' as check_category,
  '' as separator_1;

-- 1. Edge function errors table (for retry logic)
SELECT 
  'edge_function_errors table' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'edge_function_errors') 
    THEN '✅ EXISTS - Retry logic enabled'
    ELSE '❌ MISSING - Run: 20260118000002_add_retry_support.sql'
  END as status;

-- 2. Proactive events notified column
SELECT 
  'proactive_vehicle_events.notified column' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND column_name = 'notified'
    ) 
    THEN '✅ EXISTS - Deduplication enabled'
    ELSE '⚠️ MISSING - Column may not exist (non-critical, handled in code)'
  END as status;

-- 3. Chat history proactive columns
SELECT 
  'vehicle_chat_history.is_proactive column' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'vehicle_chat_history' 
      AND column_name = 'is_proactive'
    ) 
    THEN '✅ EXISTS - Proactive chat enabled'
    ELSE '❌ MISSING - Run: 20260114000005_add_proactive_chat_columns.sql'
  END as status;

-- 4. Trip sync status table
SELECT 
  'trip_sync_status table' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trip_sync_status') 
    THEN '✅ EXISTS - Trip sync enabled'
    ELSE '❌ MISSING - Run: 20260113180000_trip_sync_status.sql'
  END as status;

-- =====================================================
-- OPTIONAL MIGRATIONS (Nice to have)
-- =====================================================

SELECT 
  '=== OPTIONAL MIGRATIONS ===' as check_category,
  '' as separator_1;

-- 5. Trip sync progress columns
SELECT 
  'trip_sync_status progress columns' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'trip_sync_status' 
      AND column_name = 'trips_total'
    ) 
    THEN '✅ EXISTS - Progress tracking enabled'
    ELSE '⚠️ MISSING - Run: 20260119000004_add_trip_sync_progress.sql (optional)'
  END as status;

-- 6. Mileage detail table
SELECT 
  'vehicle_mileage_details table' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_mileage_details') 
    THEN '✅ EXISTS - Fuel consumption analytics enabled'
    ELSE '⚠️ MISSING - Run: 20260119000001_create_mileage_detail_table.sql (optional)'
  END as status;

-- 7. Vehicle specifications table
SELECT 
  'vehicle_specifications table' as check_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_specifications') 
    THEN '✅ EXISTS - Manufacturer data enabled'
    ELSE '⚠️ MISSING - Run: 20260119000000_create_vehicle_specifications.sql (optional)'
  END as status;

-- =====================================================
-- CRON JOB STATUS
-- =====================================================

SELECT 
  '=== CRON JOB STATUS ===' as check_category,
  '' as separator_1;

-- Check if retry cron job is scheduled
SELECT 
  'retry-failed-notifications cron job' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM cron.job 
      WHERE jobname = 'retry-failed-notifications-15min' 
      AND active = true
    )
    THEN '✅ SCHEDULED - Automatic retry enabled'
    ELSE '⚠️ MISSING - Run: 20260119000005_setup_retry_notifications_cron.sql (recommended)'
  END as status;

-- =====================================================
-- DATABASE SETTINGS STATUS
-- =====================================================

SELECT 
  '=== DATABASE SETTINGS ===' as check_category,
  '' as separator_1;

-- Check if Supabase URL is configured
SELECT 
  'app.settings.supabase_url' as check_name,
  CASE 
    WHEN current_setting('app.settings.supabase_url', true) IS NOT NULL 
    THEN '✅ CONFIGURED - URL: ' || current_setting('app.settings.supabase_url', true)
    ELSE '❌ NOT CONFIGURED - Set via: ALTER DATABASE postgres SET "app.settings.supabase_url" = ''https://...'';'
  END as status;

-- Check if service role key is configured (without showing the key)
SELECT 
  'app.settings.supabase_service_role_key' as check_name,
  CASE 
    WHEN current_setting('app.settings.supabase_service_role_key', true) IS NOT NULL 
    THEN '✅ CONFIGURED - Key is set'
    ELSE '❌ NOT CONFIGURED - Set via: ALTER DATABASE postgres SET "app.settings.supabase_service_role_key" = ''...'';'
  END as status;

-- =====================================================
-- SUMMARY
-- =====================================================

SELECT 
  '=== SUMMARY ===' as summary,
  '' as separator_1,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('edge_function_errors', 'trip_sync_status', 'vehicle_mileage_details', 'vehicle_specifications')) || ' optional tables found' as optional_tables_status,
  (SELECT CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry-failed-notifications-15min' AND active = true) THEN '✅ Cron job active' ELSE '⚠️ Cron job not active' END) as cron_status,
  (SELECT CASE WHEN current_setting('app.settings.supabase_url', true) IS NOT NULL AND current_setting('app.settings.supabase_service_role_key', true) IS NOT NULL THEN '✅ Settings configured' ELSE '❌ Settings not configured' END) as settings_status;
