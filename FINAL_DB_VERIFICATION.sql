-- =====================================================
-- FINAL DATABASE VERIFICATION QUERY
-- Run this to confirm all DB components are active
-- =====================================================

-- 1. ✅ VERIFY ENUMS (Should include 'vehicle_moving')
SELECT 
  'Enum Check' as verification,
  CASE 
    WHEN 'vehicle_moving' = ANY(enum_range(NULL::event_type)::text[]) THEN '✅ PASS' 
    ELSE '❌ FAIL - vehicle_moving missing' 
  END as status,
  enum_range(NULL::event_type)::text as current_values;

-- 2. ✅ VERIFY FUNCTIONS EXIST
SELECT 
  'Function Check' as verification,
  CASE 
    WHEN COUNT(*) = 4 THEN '✅ PASS' 
    ELSE '❌ FAIL - Found ' || COUNT(*) || '/4 functions' 
  END as status,
  string_agg(proname, ', ') as found_functions
FROM pg_proc 
WHERE proname IN (
  'detect_vehicle_events',
  'detect_overspeeding_unified',
  'detect_online_status_changes',
  'create_proactive_event'
);

-- 3. ✅ VERIFY TRIGGERS ACTIVE
SELECT 
  'Trigger Check' as verification,
  CASE 
    WHEN COUNT(*) = 3 THEN '✅ PASS' 
    ELSE '❌ FAIL - Found ' || COUNT(*) || '/3 active triggers' 
  END as status,
  string_agg(tgname || ' (' || tgenabled::text || ')', ', ') as found_triggers
FROM pg_trigger 
WHERE tgname IN (
  'detect_events_on_position_update',
  'detect_status_changes_on_vehicle_positions',
  'trigger_detect_overspeeding_unified'
) AND tgenabled = 'O';

-- 4. ✅ VERIFY IGNITION COLUMNS
SELECT 
  'Column Check' as verification,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'position_history' 
      AND column_name = 'ignition_on'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'vehicle_positions' 
      AND column_name = 'ignition_on'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'vehicle_positions' 
      AND column_name = 'ignition_confidence'
    )
    THEN '✅ PASS' 
    ELSE '❌ FAIL - Ignition columns missing' 
  END as status,
  (
    SELECT string_agg(column_name, ', ')
    FROM (
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'position_history' 
      AND column_name IN ('ignition_on', 'ignition_confidence')
      UNION ALL
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicle_positions' 
      AND column_name IN ('ignition_on', 'ignition_confidence')
    ) s
  ) as found_columns
