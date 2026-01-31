
-- Add gps51_id column to geofence_zones table
-- This stores the external ID returned by the GPS51 platform for synchronization

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'geofence_zones' 
        AND column_name = 'gps51_id'
    ) THEN
        ALTER TABLE public.geofence_zones 
        ADD COLUMN gps51_id TEXT;
        
        -- Add index for faster lookups during sync
        CREATE INDEX idx_geofence_gps51_id ON geofence_zones(gps51_id);
    END IF;
END $$;
