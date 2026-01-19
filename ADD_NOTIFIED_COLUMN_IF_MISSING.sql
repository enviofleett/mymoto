-- =====================================================
-- ADD NOTIFIED COLUMN IF MISSING
-- Run this if the notified column doesn't exist
-- =====================================================

-- Check if notified column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' 
    AND column_name = 'notified'
  ) THEN
    -- Add notified column
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN notified BOOLEAN DEFAULT false;
    
    RAISE NOTICE '✅ Added notified column';
  ELSE
    RAISE NOTICE '✅ notified column already exists';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' 
    AND column_name = 'notified_at'
  ) THEN
    -- Add notified_at column
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN notified_at TIMESTAMP WITH TIME ZONE;
    
    RAISE NOTICE '✅ Added notified_at column';
  ELSE
    RAISE NOTICE '✅ notified_at column already exists';
  END IF;
END $$;

-- Verify columns were added
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'proactive_vehicle_events'
  AND table_schema = 'public'
  AND column_name IN ('notified', 'notified_at')
ORDER BY column_name;
