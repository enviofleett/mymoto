-- Add notified columns to proactive_vehicle_events table
-- These columns are needed for the edge function to mark events as notified
-- The migration 20260109131500_proactive_events.sql shows these columns should exist,
-- but the actual table might have been created by 20260110063018 which doesn't include them

-- Check if columns exist first
DO $$
BEGIN
  -- Add notified column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' 
    AND column_name = 'notified'
  ) THEN
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN notified BOOLEAN DEFAULT false;
    
    RAISE NOTICE 'Added notified column to proactive_vehicle_events';
  ELSE
    RAISE NOTICE 'notified column already exists';
  END IF;

  -- Add notified_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' 
    AND column_name = 'notified_at'
  ) THEN
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN notified_at TIMESTAMP WITH TIME ZONE;
    
    RAISE NOTICE 'Added notified_at column to proactive_vehicle_events';
  ELSE
    RAISE NOTICE 'notified_at column already exists';
  END IF;
END $$;

-- Verify columns exist
SELECT 
  'COLUMN CHECK' as status,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'proactive_vehicle_events'
  AND column_name IN ('notified', 'notified_at')
ORDER BY column_name;

-- ============================================
-- IMPORTANT NOTES
-- ============================================
-- After adding these columns:
-- 1. Webhook can now mark events as notified
-- 2. Edge function can update notified = true
-- 3. Duplicate prevention will work correctly
--
-- If webhook is configured, test again:
-- INSERT INTO proactive_vehicle_events (
--   device_id, event_type, severity, title, message
-- )
-- VALUES (
--   'TEST_DEVICE_001', 'critical_battery', 'critical', 
--   'After Column Add', 'Testing after adding notified column'
-- );
--
-- Then check: SELECT notified, notified_at FROM proactive_vehicle_events WHERE title = 'After Column Add';
