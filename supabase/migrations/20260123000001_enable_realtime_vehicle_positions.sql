-- Enable Realtime for vehicle_positions table
-- This allows instant location updates without polling
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;

-- Set REPLICA IDENTITY FULL for complete row data in realtime updates
-- This ensures we get all columns in the UPDATE payload
ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;
