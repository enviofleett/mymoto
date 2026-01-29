-- Enable Realtime for vehicle_positions table
-- This allows instant location updates without polling
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'vehicle_positions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;
    END IF;
END $$;

-- Set REPLICA IDENTITY FULL for complete row data in realtime updates
-- This ensures we get all columns in the UPDATE payload
ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;
