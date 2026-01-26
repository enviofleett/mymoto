-- Add source tracking to vehicle_trips table
-- This allows us to distinguish GPS51 trips from locally detected trips
-- Ensures 100% GPS51 parity verification

-- Add source column
ALTER TABLE vehicle_trips
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'gps51' CHECK (source IN ('gps51', 'local', 'manual'));

-- Update existing trips to 'gps51' (assume all existing trips are from GPS51)
UPDATE vehicle_trips 
SET source = 'gps51' 
WHERE source IS NULL;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_source ON vehicle_trips(device_id, source);

-- Add comment for documentation
COMMENT ON COLUMN vehicle_trips.source IS 'Trip data source: gps51 (from GPS51 API), local (detected from position_history), manual (manually created)';

-- Verify the column was added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vehicle_trips' 
    AND column_name = 'source'
  ) THEN
    RAISE EXCEPTION 'Failed to add source column to vehicle_trips table';
  END IF;
END $$;
