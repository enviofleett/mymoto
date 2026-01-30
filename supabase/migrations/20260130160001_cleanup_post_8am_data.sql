-- Migration: Cleanup Data Created After 8am Today (Restoring State)
-- Description:
-- Deletes all vehicle_trips created after 8:00 AM Lagos time today (2026-01-30).
-- This effectively rolls back the data state to "before the ghost trip bug set in" (or at least removes the recent sync attempts).

DO $$
BEGIN
  -- 8am Lagos time is 7am UTC on 2026-01-30
  -- Assuming system clock is UTC or timezone aware
  -- Using explicit timestamp to be safe
  
  DELETE FROM vehicle_trips
  WHERE created_at > '2026-01-30 08:00:00+01'; -- 8 AM Lagos time (UTC+1)

  RAISE NOTICE 'Deleted trips created after 8am today';
END;
$$;
