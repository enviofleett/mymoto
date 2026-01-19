-- Add ignition confidence tracking columns to position_history
-- This enables monitoring of ignition detection quality
-- Optimized for large tables: Add columns first, then constraints, then indexes

-- Step 1: Add columns without constraints (fast, even on large tables)
ALTER TABLE public.position_history 
  ADD COLUMN IF NOT EXISTS ignition_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS ignition_detection_method TEXT;

-- Step 2: Add check constraints separately (validates against new inserts/updates only)
-- Note: Constraints only validate new inserts/updates, existing NULL values are allowed
DO $$
BEGIN
  -- Add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'position_history_ignition_confidence_check'
  ) THEN
    ALTER TABLE public.position_history
      ADD CONSTRAINT position_history_ignition_confidence_check 
      CHECK (ignition_confidence IS NULL OR (ignition_confidence >= 0 AND ignition_confidence <= 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'position_history_ignition_detection_method_check'
  ) THEN
    ALTER TABLE public.position_history
      ADD CONSTRAINT position_history_ignition_detection_method_check 
      CHECK (ignition_detection_method IS NULL OR ignition_detection_method IN ('status_bit', 'string_parse', 'speed_inference', 'multi_signal', 'unknown'));
  END IF;
END $$;

-- Step 3: Create indexes separately (can be slow on large tables, but runs after column addition)
DO $$
BEGIN
  -- Check if index exists before creating
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'position_history' 
    AND indexname = 'idx_position_ignition_confidence'
  ) THEN
    CREATE INDEX idx_position_ignition_confidence 
      ON public.position_history(device_id, ignition_confidence) 
      WHERE ignition_confidence IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'position_history' 
    AND indexname = 'idx_position_detection_method'
  ) THEN
    CREATE INDEX idx_position_detection_method 
      ON public.position_history(device_id, ignition_detection_method) 
      WHERE ignition_detection_method IS NOT NULL;
  END IF;
END $$;

-- Step 4: Add comments (fast operation)
COMMENT ON COLUMN public.position_history.ignition_confidence IS 'Confidence score (0.0 to 1.0) for ignition detection';
COMMENT ON COLUMN public.position_history.ignition_detection_method IS 'Method used to detect ignition: status_bit, string_parse, speed_inference, multi_signal, or unknown';
