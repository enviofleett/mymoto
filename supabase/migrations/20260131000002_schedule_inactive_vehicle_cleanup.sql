-- Schedule daily cleanup of inactive vehicles (30+ days inactive)
-- Runs at 04:00 UTC daily

-- Ensure pg_cron is enabled (standard in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the scheduled job
-- We wrap the SELECT in a PERFORM block logic implicitly by just executing the SELECT.
-- pg_cron accepts any valid SQL statement.
SELECT cron.schedule(
  'cleanup-inactive-vehicles',   -- unique job name
  '0 4 * * *',                   -- 04:00 UTC daily
  $$SELECT remove_inactive_vehicles(30, NULL, 100, NULL, 'automated')$$
);

-- Documentation
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';
