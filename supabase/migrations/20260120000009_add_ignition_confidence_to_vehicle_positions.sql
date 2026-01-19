-- Add ignition confidence tracking columns to vehicle_positions
-- This enables monitoring of ignition detection quality in the latest position cache
-- Matches the columns already added to position_history

-- Step 1: Add columns without constraints (fast, even on large tables)
ALTER TABLE public.vehicle_positions 
  ADD COLUMN IF NOT EXISTS ignition_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS ignition_detection_method TEXT;

-- Step 2: Add check constraints separately (validates against new inserts/updates only)
DO $$
BEGIN
  -- Add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'vehicle_positions_ignition_confidence_check'
  ) THEN
    ALTER TABLE public.vehicle_positions
      ADD CONSTRAINT vehicle_positions_ignition_confidence_check 
      CHECK (ignition_confidence IS NULL OR (ignition_confidence >= 0 AND ignition_confidence <= 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'vehicle_positions_ignition_detection_method_check'
  ) THEN
    ALTER TABLE public.vehicle_positions
      ADD CONSTRAINT vehicle_positions_ignition_detection_method_check 
      CHECK (ignition_detection_method IS NULL OR ignition_detection_method IN ('status_bit', 'string_parse', 'speed_inference', 'multi_signal', 'unknown'));
  END IF;
END $$;

-- Step 3: Create indexes for efficient queries
DO $$
BEGIN
  -- Check if index exists before creating
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'vehicle_positions' 
    AND indexname = 'idx_vehicle_positions_ignition_confidence'
  ) THEN
    CREATE INDEX idx_vehicle_positions_ignition_confidence 
      ON public.vehicle_positions(device_id, ignition_confidence) 
      WHERE ignition_confidence IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'vehicle_positions' 
    AND indexname = 'idx_vehicle_positions_detection_method'
  ) THEN
    CREATE INDEX idx_vehicle_positions_detection_method 
      ON public.vehicle_positions(device_id, ignition_detection_method) 
      WHERE ignition_detection_method IS NOT NULL;
  END IF;
END $$;

-- Step 4: Add comments
COMMENT ON COLUMN public.vehicle_positions.ignition_confidence IS 'Confidence score (0.0 to 1.0) for ignition detection';
COMMENT ON COLUMN public.vehicle_positions.ignition_detection_method IS 'Method used to detect ignition: status_bit, string_parse, speed_inference, multi_signal, or unknown';
