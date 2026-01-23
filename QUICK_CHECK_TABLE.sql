-- ============================================================================
-- Quick Check: Does vehicle_positions exist and what's its REPLICA IDENTITY?
-- ============================================================================

-- Step 1: Check if table exists
SELECT 
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_name = 'vehicle_positions';

-- Step 2: Direct REPLICA IDENTITY check (simpler query)
SELECT 
  relname as table_name,
  relreplident as replica_identity_code,
  CASE relreplident
    WHEN 'f' THEN '✅ FULL'
    WHEN 'd' THEN '⚠️ DEFAULT'
    WHEN 'n' THEN '❌ NOTHING'
    ELSE '❓ OTHER'
  END as status
FROM pg_class
WHERE relname = 'vehicle_positions';

-- Step 3: Check current setting another way
SELECT 
  schemaname,
  tablename,
  'Check result above for REPLICA IDENTITY' as note
FROM pg_tables
WHERE tablename = 'vehicle_positions';
