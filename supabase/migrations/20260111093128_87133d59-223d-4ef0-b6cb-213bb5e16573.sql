-- Enable Realtime for proactive_vehicle_events table
ALTER PUBLICATION supabase_realtime ADD TABLE proactive_vehicle_events;

-- Set REPLICA IDENTITY FULL for complete row data in realtime updates
ALTER TABLE proactive_vehicle_events REPLICA IDENTITY FULL;