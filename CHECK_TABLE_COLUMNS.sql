-- =====================================================
-- CHECK TABLE COLUMNS
-- Run this to see what columns exist in proactive_vehicle_events
-- =====================================================

-- Check all columns in proactive_vehicle_events table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'proactive_vehicle_events'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check specifically for notified and notified_at columns
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND column_name = 'notified'
    ) THEN '✅ notified column EXISTS'
    ELSE '❌ notified column MISSING'
  END as notified_column_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND column_name = 'notified_at'
    ) THEN '✅ notified_at column EXISTS'
    ELSE '❌ notified_at column MISSING'
  END as notified_at_column_status;
