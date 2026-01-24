-- Add separate GPS fix timestamp and source metadata
--
-- Problem:
-- - GPS51 provides multiple timestamps:
--   - updatetime: "last location updating time after comprehensive calculation" (what GPS51 typically shows as "last update")
--   - validpoistiontime: "last valid location time" (true GPS fix time)
-- - Some devices send invalid/future "GPS time" values; we need to store both and validate.

ALTER TABLE public.vehicle_positions
  ADD COLUMN IF NOT EXISTS gps_fix_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_source TEXT,
  ADD COLUMN IF NOT EXISTS gps_valid_num INTEGER;

ALTER TABLE public.position_history
  ADD COLUMN IF NOT EXISTS gps_fix_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_source TEXT,
  ADD COLUMN IF NOT EXISTS gps_valid_num INTEGER;

