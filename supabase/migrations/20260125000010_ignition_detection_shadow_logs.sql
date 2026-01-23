-- Phase 3: ignition detection shadow-mode logging
-- Purpose: compare "current" ignition_on with a new algorithm safely (no behavior change).

CREATE TABLE IF NOT EXISTS public.ignition_detection_shadow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gps_time TIMESTAMPTZ NULL,
  speed_kmh NUMERIC NULL,
  status_raw BIGINT NULL,
  strstatus TEXT NULL,
  old_ignition_on BOOLEAN NULL,
  new_ignition_on BOOLEAN NULL,
  new_confidence NUMERIC NULL,
  new_method TEXT NULL,
  note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_ignition_shadow_device_time
  ON public.ignition_detection_shadow_logs (device_id, recorded_at DESC);

ALTER TABLE public.ignition_detection_shadow_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read ignition shadow logs" ON public.ignition_detection_shadow_logs;
CREATE POLICY "Admins can read ignition shadow logs"
  ON public.ignition_detection_shadow_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No insert policy needed: edge functions use service role key (bypasses RLS).

