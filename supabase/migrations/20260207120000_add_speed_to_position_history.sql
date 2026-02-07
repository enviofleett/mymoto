-- Add missing speed column to position_history for trip aggregation views
-- Ensures migrations that reference speed can run locally and in new environments
ALTER TABLE public.position_history
  ADD COLUMN IF NOT EXISTS speed numeric;
