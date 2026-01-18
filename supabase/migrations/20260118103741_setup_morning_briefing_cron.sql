-- Schedule Morning Briefing Cron Job
-- Runs daily at 7 AM UTC to generate retrospective summaries for vehicles

-- Note: The morning-briefing function currently requires a device_id parameter.
-- This cron job will need to be extended to process all vehicles, or the function
-- should be modified to accept no device_id and process all vehicles with morning_greeting enabled.

-- For now, create a scheduled job that can be manually triggered or extended
-- to process all vehicles programmatically.

-- Safely unschedule any existing morning briefing jobs
DO $$
BEGIN
  -- Try to unschedule existing job (if it exists)
  BEGIN
    PERFORM cron.unschedule('morning-briefing-daily');
  EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist, that's fine - continue
    NULL;
  END;
END $$;

-- Schedule morning briefing to run daily at 7 AM UTC
-- TODO: This currently requires device_id - needs to be extended to process all vehicles
-- For now, this can be called manually or extended with a loop to process all devices
SELECT cron.schedule(
  'morning-briefing-daily',
  '0 7 * * *', -- Daily at 7 AM UTC
  $$
  -- Note: This is a placeholder that needs extension
  -- The morning-briefing function requires device_id parameter
  -- Future enhancement: Loop through all vehicles with morning_greeting enabled
  -- For now, this job is scheduled but needs manual invocation or function modification
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/morning-briefing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := jsonb_build_object(
        'trigger', 'scheduled',
        'note', 'This cron job needs to be extended to process all vehicles with morning_greeting enabled'
      )
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Schedules automatic morning briefing at 7 AM UTC daily';

-- Note: To fully automate, either:
-- 1. Modify morning-briefing function to process all vehicles when device_id is not provided
-- 2. Create a wrapper function that loops through all devices and calls morning-briefing for each
-- 3. Use a database function to iterate through vehicles and call the edge function for each
