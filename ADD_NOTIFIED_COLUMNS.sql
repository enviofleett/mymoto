-- =====================================================
-- ADD NOTIFIED COLUMNS (Simple Version)
-- Run this if notified columns are missing
-- =====================================================

-- Add notified column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' 
    AND table_schema = 'public'
    AND column_name = 'notified'
  ) THEN
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN notified BOOLEAN DEFAULT false;
    
    RAISE NOTICE '✅ Added notified column';
  ELSE
    RAISE NOTICE '✅ notified column already exists';
  END IF;
END $$;

-- Add notified_at column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' 
    AND table_schema = 'public'
    AND column_name = 'notified_at'
  ) THEN
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
