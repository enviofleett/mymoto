-- Enable Realtime for trip_sync_status only
-- vehicle_trips is now a VIEW and cannot be added to publication
-- Required for useRealtimeTripUpdates: live trip report updates on sync complete

DO $$
BEGIN
  -- Check if trip_sync_status is a table before adding to publication
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'trip_sync_status'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'trip_sync_status'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE trip_sync_status;
    END IF;
  END IF;
END;
$$;

-- Complete row data in realtime payloads (consistent with vehicle_positions)
-- trip_sync_status only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'trip_sync_status'
  ) THEN
    ALTER TABLE trip_sync_status REPLICA IDENTITY FULL;
  END IF;
END;
$$;
