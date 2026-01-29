-- Migration: Add source tracking to vehicle_trips
-- Description: Skipped because vehicle_trips is now a VIEW (redefined in 20260126000000_fix_gps51_trip_parity.sql)
-- The view definition already includes 'gps51_parity'::text AS source.
-- This file is kept to maintain migration history but performs no operations.

DO $$
BEGIN
  -- No-op
  NULL;
END $$;
