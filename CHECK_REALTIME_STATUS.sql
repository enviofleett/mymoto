-- Check if vehicle_positions is enabled for Realtime
-- Run this in Supabase SQL Editor to verify Realtime is enabled

-- Check if vehicle_positions is in the realtime publication
SELECT 
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'vehicle_positions';

-- If the query returns no rows, Realtime is NOT enabled
-- Run this to enable it:
-- ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;
-- ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;

-- Check REPLICA IDENTITY setting
SELECT 
  tablename,
  relreplident
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'vehicle_positions';

-- relreplident values:
-- 'd' = DEFAULT (only primary key)
-- 'n' = NOTHING (no replica identity)
-- 'f' = FULL (all columns)
-- 'i' = INDEX (specific index)

-- We need 'f' (FULL) for complete row data in updates
