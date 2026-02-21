DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'geofence_zones'
      AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.geofence_zones
    ADD COLUMN priority INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'geofence_zones'
      AND column_name = 'effective_start_time'
  ) THEN
    ALTER TABLE public.geofence_zones
    ADD COLUMN effective_start_time TIME;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'geofence_zones'
      AND column_name = 'effective_end_time'
  ) THEN
    ALTER TABLE public.geofence_zones
    ADD COLUMN effective_end_time TIME;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'geofence_zones'
      AND column_name = 'active_days'
  ) THEN
    ALTER TABLE public.geofence_zones
    ADD COLUMN active_days INTEGER[];
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'geofence_zones'
      AND column_name = 'speed_limit_kmh'
  ) THEN
    ALTER TABLE public.geofence_zones
    ADD COLUMN speed_limit_kmh INTEGER;
  END IF;
END $$;

DO $$
DECLARE
  type_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'geofence_rule_type'
      AND n.nspname = 'public'
  ) INTO type_exists;

  IF NOT type_exists THEN
    CREATE TYPE public.geofence_rule_type AS ENUM (
      'speed_limit',
      'parking',
      'no_entry',
      'route_deviation',
      'time_restriction',
      'vehicle_specific',
      'proximity_alert',
      'environmental',
      'maintenance_mode',
      'passenger_notification',
      'custom'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.geofence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofence_id UUID NOT NULL REFERENCES public.geofence_zones(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
  rule_type public.geofence_rule_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofence_rules_geofence ON public.geofence_rules(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_rules_device ON public.geofence_rules(device_id);
CREATE INDEX IF NOT EXISTS idx_geofence_rules_active ON public.geofence_rules(is_active, priority DESC);

ALTER TABLE public.geofence_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'geofence_rules'
      AND policyname = 'Users can view geofence rules'
  ) THEN
    CREATE POLICY "Users can view geofence rules"
    ON public.geofence_rules FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'geofence_rules'
      AND policyname = 'Users can create geofence rules'
  ) THEN
    CREATE POLICY "Users can create geofence rules"
    ON public.geofence_rules FOR INSERT
    WITH CHECK (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'geofence_rules'
      AND policyname = 'Users can update geofence rules'
  ) THEN
    CREATE POLICY "Users can update geofence rules"
    ON public.geofence_rules FOR UPDATE
    USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'geofence_rules'
      AND policyname = 'Users can delete geofence rules'
  ) THEN
    CREATE POLICY "Users can delete geofence rules"
    ON public.geofence_rules FOR DELETE
    USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
DECLARE
  value_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'event_type'
      AND n.nspname = 'public'
      AND e.enumlabel = 'geofence_speed_limit'
  ) INTO value_exists;

  IF NOT value_exists THEN
    ALTER TYPE public.event_type ADD VALUE 'geofence_speed_limit';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.detect_geofence_speed_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_geofence RECORD;
  zone_record RECORD;
  speed_limit INTEGER;
  speed_over NUMERIC;
  severity public.event_severity;
  existing_time TIMESTAMPTZ;
BEGIN
  IF NEW.speed IS NULL OR NEW.speed <= 0 OR NEW.speed > 300 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO current_geofence
  FROM check_geofence_status(NEW.device_id, NEW.latitude, NEW.longitude);

  IF NOT FOUND OR NOT current_geofence.inside_geofence THEN
    RETURN NEW;
  END IF;

  SELECT * INTO zone_record
  FROM geofence_zones
  WHERE id = current_geofence.geofence_id;

  IF zone_record.speed_limit_kmh IS NULL THEN
    RETURN NEW;
  END IF;

  speed_limit := zone_record.speed_limit_kmh;

  IF NEW.speed <= speed_limit THEN
    RETURN NEW;
  END IF;

  speed_over := NEW.speed - speed_limit;

  IF speed_over > 40 THEN
    severity := 'critical';
  ELSIF speed_over > 20 THEN
    severity := 'error';
  ELSE
    severity := 'warning';
  END IF;

  SELECT MAX(created_at) INTO existing_time
  FROM proactive_vehicle_events
  WHERE device_id = NEW.device_id
    AND event_type = 'geofence_speed_limit'
    AND metadata ->> 'geofence_id' = current_geofence.geofence_id::text
    AND created_at > now() - interval '5 minutes';

  IF existing_time IS NULL THEN
    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'geofence_speed_limit',
      p_severity := severity,
      p_title := format('Speed limit exceeded in %s', current_geofence.geofence_name),
      p_description := format('Speed %s km/h, limit %s km/h in %s', NEW.speed, speed_limit, current_geofence.geofence_name),
      p_metadata := jsonb_build_object(
        'geofence_id', current_geofence.geofence_id,
        'geofence_name', current_geofence.geofence_name,
        'zone_type', current_geofence.zone_type,
        'speed', NEW.speed,
        'speed_limit', speed_limit,
        'over_by', speed_over
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_value_after := NEW.speed,
      p_threshold := speed_limit
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS detect_geofence_speed_limit_trigger ON public.position_history;

CREATE TRIGGER detect_geofence_speed_limit_trigger
AFTER INSERT ON public.position_history
FOR EACH ROW
EXECUTE FUNCTION public.detect_geofence_speed_limit();

