-- Apply Missing Migration: Add Ignition Confidence to vehicle_positions
-- This migration adds confidence tracking columns to the vehicle_positions table
-- Run this if CHECK_COLUMNS_EXIST.sql shows these columns are missing

-- ============================================================================
-- Step 1: Add columns without constraints (fast, even on large tables)
-- ============================================================================
ALTER TABLE public.vehicle_positions 
  ADD COLUMN IF NOT EXISTS ignition_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS ignition_detection_method TEXT;

-- ============================================================================
-- Step 2: Add check constraints separately
-- ============================================================================
DO $$
BEGIN
  -- Add confidence constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'vehicle_positions_ignition_confidence_check'
  ) THEN
    ALTER TABLE public.vehicle_positions
      ADD CONSTRAINT vehicle_positions_ignition_confidence_check 
      CHECK (ignition_confidence IS NULL OR (ignition_confidence >= 0 AND ignition_confidence <= 1));
  END IF;

  -- Add detection method constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'vehicle_positions_ignition_detection_method_check'
  ) THEN
    ALTER TABLE public.vehicle_positions
      ADD CONSTRAINT vehicle_positions_ignition_detection_method_check 
      CHECK (ignition_detection_method IS NULL OR ignition_detection_method IN ('status_bit', 'string_parse', 'speed_inference', 'multi_signal', 'unknown'));
  END IF;
END $$;

-- ============================================================================
-- Step 3: Create indexes for efficient queries
-- ============================================================================
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

-- ============================================================================
-- Step 4: Add comments
-- ============================================================================
COMMENT ON COLUMN public.vehicle_positions.ignition_confidence IS 'Confidence score (0.0 to 1.0) for ignition detection';
COMMENT ON COLUMN public.vehicle_positions.ignition_detection_method IS 'Method used to detect ignition: status_bit, string_parse, speed_inference, multi_signal, or unknown';

-- ============================================================================
-- Step 5: Verify columns were added
-- ============================================================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  CASE 
    WHEN column_name = 'ignition_confidence' THEN '✅ Added'
    WHEN column_name = 'ignition_detection_method' THEN '✅ Added'
    ELSE 'Existing'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vehicle_positions'
  AND column_name IN ('ignition_confidence', 'ignition_detection_method')
ORDER BY column_name;

-- ============================================================================
-- Step 6: Optional - Backfill confidence data from position_history
-- ============================================================================
-- Uncomment this section if you want to populate confidence for existing positions
/*
UPDATE vehicle_positions vp
SET 
  ignition_confidence = ph.ignition_confidence,
  ignition_detection_method = ph.ignition_detection_method
FROM (
  SELECT DISTINCT ON (device_id)
    device_id,
    ignition_confidence,
    ignition_detection_method
  FROM position_history
  WHERE ignition_confidence IS NOT NULL
    AND ignition_detection_method IS NOT NULL
  ORDER BY device_id, gps_time DESC
) ph
WHERE vp.device_id = ph.device_id
  AND vp.ignition_confidence IS NULL;

-- Show backfill results
SELECT 
  COUNT(*) as total_positions,
  COUNT(ignition_confidence) as with_confidence,
  COUNT(ignition_detection_method) as with_method
FROM vehicle_positions;
*/
