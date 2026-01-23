-- Check REPLICA IDENTITY for vehicle_positions
-- This determines what data is sent in UPDATE events

SELECT 
  c.relname AS tablename,
  CASE c.relreplident
    WHEN 'd' THEN 'DEFAULT (primary key only)'
    WHEN 'n' THEN 'NOTHING (no replica identity)'
    WHEN 'f' THEN 'FULL (all columns) ✅'
    WHEN 'i' THEN 'INDEX (specific index)'
  END AS replica_identity,
  c.relreplident
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'vehicle_positions';

-- If it's not 'FULL', run this:
-- ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;
