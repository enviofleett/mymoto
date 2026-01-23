-- Feature flags + per-device allowlist + staleness monitoring helpers
-- Phase 1 safety infrastructure (defaults OFF, no behavior change unless enabled)

-- ============
-- Feature flags (global)
-- ============
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON public.feature_flags;
CREATE POLICY "Authenticated users can read feature flags"
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage feature flags" ON public.feature_flags;
CREATE POLICY "Admins can manage feature flags"
  ON public.feature_flags
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON public.feature_flags;
CREATE OR REPLACE FUNCTION public.update_feature_flags_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_feature_flags_updated_at();

-- ============
-- Per-device flag allowlist
-- ============
CREATE TABLE IF NOT EXISTS public.feature_flag_devices (
  flag_key TEXT NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flag_key, device_id)
);

ALTER TABLE public.feature_flag_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read device feature flags" ON public.feature_flag_devices;
CREATE POLICY "Authenticated users can read device feature flags"
  ON public.feature_flag_devices
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage device feature flags" ON public.feature_flag_devices;
CREATE POLICY "Admins can manage device feature flags"
  ON public.feature_flag_devices
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_feature_flag_devices_updated_at ON public.feature_flag_devices;
CREATE OR REPLACE FUNCTION public.update_feature_flag_devices_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_feature_flag_devices_updated_at
BEFORE UPDATE ON public.feature_flag_devices
FOR EACH ROW
EXECUTE FUNCTION public.update_feature_flag_devices_updated_at();

-- ============
-- Helper functions (safe reads)
-- ============
CREATE OR REPLACE FUNCTION public.is_feature_enabled(flag_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.feature_flags WHERE key = flag_key),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_device_feature_enabled(flag_key TEXT, device_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.is_feature_enabled(flag_key)
    AND COALESCE(
      (SELECT enabled FROM public.feature_flag_devices WHERE flag_key = flag_key AND device_id = device_id),
      FALSE
    );
$$;

-- ============
-- Seed flags (all OFF by default)
-- ============
INSERT INTO public.feature_flags (key, enabled, description, config)
VALUES
  ('realtime_vehicle_positions_enabled', FALSE, 'Enable vehicle_positions realtime subscription path (guarded by per-device allowlist).', '{}'::jsonb),
  ('new_ignition_detection_shadow', FALSE, 'Compute new ignition detection in parallel for comparison only (no behavior change).', '{}'::jsonb),
  ('new_ignition_detection_enabled', FALSE, 'Enable new ignition detection behavior (after shadow mode validation).', '{}'::jsonb),
  ('vehicle_moving_event_enabled', FALSE, 'Enable vehicle_moving event generation (guarded).', '{}'::jsonb),
  ('sync_logging_verbose', FALSE, 'Enable verbose logging in gps-data/sync functions.', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

