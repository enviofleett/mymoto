ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_status TEXT DEFAULT 'active';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS hibernated_at TIMESTAMPTZ;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS last_online_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vehicles_status_last_online
  ON public.vehicles (vehicle_status, last_online_at);

CREATE TABLE IF NOT EXISTS public.vehicle_hibernation_log (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_online_at TIMESTAMPTZ,
  days_offline INTEGER,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehicle_hibernation_log_device_event
  ON public.vehicle_hibernation_log (device_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_last_gps_time
  ON public.vehicle_positions (device_id, gps_time DESC);

SELECT
  cron.schedule(
    'hibernate-inactive-vehicles',
    '0 2 * * *',
    $$
    SELECT
      net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/hibernate-inactive-vehicles',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
        ),
        body := '{}'::jsonb
      );
    $$
  );
