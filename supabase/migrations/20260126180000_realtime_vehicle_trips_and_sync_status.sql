-- Enable Realtime for vehicle_trips and trip_sync_status
-- Required for useRealtimeTripUpdates: live trip report updates on sync complete + new trip INSERTs

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vehicle_trips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_trips;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'trip_sync_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE trip_sync_status;
  END IF;
END;
$$;

-- Complete row data in realtime payloads (consistent with vehicle_positions)
ALTER TABLE vehicle_trips REPLICA IDENTITY FULL;
ALTER TABLE trip_sync_status REPLICA IDENTITY FULL;
