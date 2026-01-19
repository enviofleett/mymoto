-- Check if ignition confidence columns exist in tables
-- Run this to verify migrations have been applied

-- ============================================================================
-- Check position_history table
-- ============================================================================
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'position_history' 
      AND column_name = 'ignition_confidence'
    ) THEN '✅ ignition_confidence exists in position_history'
    ELSE '❌ ignition_confidence does NOT exist - run: supabase/migrations/20260118051409_add_ignition_confidence.sql'
  END as position_history_confidence_status;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'position_history' 
      AND column_name = 'ignition_detection_method'
    ) THEN '✅ ignition_detection_method exists in position_history'
    ELSE '❌ ignition_detection_method does NOT exist - run: supabase/migrations/20260118051409_add_ignition_confidence.sql'
  END as position_history_method_status;

-- ============================================================================
-- Check vehicle_positions table
-- ============================================================================
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'vehicle_positions' 
      AND column_name = 'ignition_confidence'
    ) THEN '✅ ignition_confidence exists in vehicle_positions'
    ELSE '❌ ignition_confidence does NOT exist - run: supabase/migrations/20260120000009_add_ignition_confidence_to_vehicle_positions.sql'
  END as vehicle_positions_confidence_status;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'vehicle_positions' 
      AND column_name = 'ignition_detection_method'
    ) THEN '✅ ignition_detection_method exists in vehicle_positions'
    ELSE '❌ ignition_detection_method does NOT exist - run: supabase/migrations/20260120000009_add_ignition_confidence_to_vehicle_positions.sql'
  END as vehicle_positions_method_status;

-- ============================================================================
-- Check acc_state_history table
-- ============================================================================
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'acc_state_history'
    ) THEN '✅ acc_state_history table exists'
    ELSE '❌ acc_state_history table does NOT exist - run: supabase/migrations/20260118051247_create_acc_state_history.sql'
  END as acc_state_history_status;

-- ============================================================================
-- Summary: List all ignition-related columns
-- ============================================================================
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('position_history', 'vehicle_positions', 'acc_state_history')
  AND (
    column_name LIKE '%ignition%' 
    OR column_name LIKE '%acc%'
    OR column_name LIKE '%confidence%'
  )
ORDER BY table_name, column_name;
