-- Create trip sync status table to track automatic processing
CREATE TABLE IF NOT EXISTS trip_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  last_sync_at timestamptz DEFAULT now(),
  last_position_processed timestamptz,
  sync_status text DEFAULT 'idle' CHECK (sync_status IN ('idle', 'processing', 'completed', 'error')),
  trips_processed integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(device_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_trip_sync_status_device_id ON trip_sync_status(device_id);
CREATE INDEX IF NOT EXISTS idx_trip_sync_status_updated ON trip_sync_status(last_sync_at DESC);

-- Enable RLS
ALTER TABLE trip_sync_status ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read sync status for their vehicles
CREATE POLICY "Users can view trip sync status for assigned vehicles"
  ON trip_sync_status
  FOR SELECT
  TO authenticated
  USING (
    device_id IN (
      SELECT device_id FROM vehicle_assignments WHERE user_id = auth.uid()
    )
  );

-- Allow service role to manage sync status
CREATE POLICY "Service role can manage trip sync status"
  ON trip_sync_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to update the last sync timestamp
CREATE OR REPLACE FUNCTION update_trip_sync_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update timestamp
CREATE TRIGGER update_trip_sync_status_timestamp
  BEFORE UPDATE ON trip_sync_status
  FOR EACH ROW
  EXECUTE FUNCTION update_trip_sync_timestamp();

-- Function to initialize sync status for a device
CREATE OR REPLACE FUNCTION initialize_trip_sync_status(p_device_id text)
RETURNS void AS $$
BEGIN
  INSERT INTO trip_sync_status (device_id, last_position_processed)
  VALUES (p_device_id, now() - interval '7 days')
  ON CONFLICT (device_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE trip_sync_status IS 'Tracks automatic trip processing status for each device';
COMMENT ON COLUMN trip_sync_status.last_position_processed IS 'The gps_time of the last position_history record processed';
COMMENT ON COLUMN trip_sync_status.sync_status IS 'Current sync status: idle, processing, completed, error';
