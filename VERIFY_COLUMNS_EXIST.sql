-- =====================================================
-- VERIFY COLUMNS EXIST
-- Run this to check if notified columns actually exist
-- =====================================================

-- Check all columns in proactive_vehicle_events
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  CASE 
    WHEN column_name IN ('notified', 'notified_at') THEN 
      CASE 
        WHEN column_name = 'notified' THEN '✅ EXISTS' 
        WHEN column_name = 'notified_at' THEN '✅ EXISTS'
        ELSE '✅ EXISTS'
      END
    ELSE '✅ EXISTS'
  END as status
FROM information_schema.columns
WHERE table_name = 'proactive_vehicle_events'
  AND table_schema = 'public'
ORDER BY 
  CASE column_name
    WHEN 'notified' THEN 1
    WHEN 'notified_at' THEN 2
    ELSE 3
  END,
  ordinal_position;

-- Specific check for notified columns
SELECT 
  'notified column' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND table_schema = 'public'
      AND column_name = 'notified'
    ) 
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run ADD_NOTIFIED_COLUMNS.sql'
  END as status
UNION ALL
SELECT 
  'notified_at column',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND table_schema = 'public'
      AND column_name = 'notified_at'
    ) 
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run ADD_NOTIFIED_COLUMNS.sql'
  END;
