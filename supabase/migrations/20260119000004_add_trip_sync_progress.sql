-- Add progress tracking columns to trip_sync_status
ALTER TABLE trip_sync_status
ADD COLUMN IF NOT EXISTS trips_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sync_progress_percent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_operation TEXT;

COMMENT ON COLUMN trip_sync_status.trips_total IS 'Total number of trips to process in current sync';
COMMENT ON COLUMN trip_sync_status.sync_progress_percent IS 'Progress percentage (0-100)';
COMMENT ON COLUMN trip_sync_status.current_operation IS 'Current operation description for user feedback (e.g., "Fetching trips from GPS51", "Processing trip 5 of 20")';
