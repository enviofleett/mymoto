-- Admin-Managed Fuel Intelligence: schema, fuzzy matching, auto-inheritance, and analytics fields.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1) Expand admin fuel catalog.
ALTER TABLE public.vehicle_fuel_specs_catalog
ADD COLUMN IF NOT EXISTS city_consumption_rate NUMERIC(6,3),
ADD COLUMN IF NOT EXISTS highway_consumption_rate NUMERIC(6,3),
ADD COLUMN IF NOT EXISTS idle_consumption_rate NUMERIC(6,3),
ADD COLUMN IF NOT EXISTS year_start INTEGER,
ADD COLUMN IF NOT EXISTS year_end INTEGER;

ALTER TABLE public.vehicle_fuel_specs_catalog
ADD CONSTRAINT vehicle_fuel_specs_catalog_city_rate_chk
CHECK (city_consumption_rate IS NULL OR city_consumption_rate > 0);

ALTER TABLE public.vehicle_fuel_specs_catalog
ADD CONSTRAINT vehicle_fuel_specs_catalog_highway_rate_chk
CHECK (highway_consumption_rate IS NULL OR highway_consumption_rate > 0);

ALTER TABLE public.vehicle_fuel_specs_catalog
ADD CONSTRAINT vehicle_fuel_specs_catalog_idle_rate_chk
CHECK (idle_consumption_rate IS NULL OR idle_consumption_rate > 0);

ALTER TABLE public.vehicle_fuel_specs_catalog
ADD CONSTRAINT vehicle_fuel_specs_catalog_year_range_chk
CHECK (
  year_start IS NULL
  OR year_end IS NULL
  OR year_start <= year_end
);

CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_specs_catalog_brand_trgm
  ON public.vehicle_fuel_specs_catalog
  USING gist (brand gist_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_specs_catalog_model_trgm
  ON public.vehicle_fuel_specs_catalog
  USING gist (model gist_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_specs_catalog_year_window
  ON public.vehicle_fuel_specs_catalog(year_start, year_end)
  WHERE is_active = true;

-- 2) Extend vehicle profile linkage.
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS fuel_profile_id UUID REFERENCES public.vehicle_fuel_specs_catalog(id),
ADD COLUMN IF NOT EXISTS fuel_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_vehicles_fuel_profile_id
  ON public.vehicles(fuel_profile_id);

-- 3) Fuel price setting (configurable global rate).
INSERT INTO public.app_settings (key, value)
VALUES ('fuel_price_per_liter', '1.00')
ON CONFLICT (key) DO NOTHING;

-- 4) Fuzzy matching function.
CREATE OR REPLACE FUNCTION public.match_vehicle_to_catalog(
  p_make TEXT,
  p_model TEXT,
  p_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  catalog_id UUID,
  score NUMERIC,
  matched_brand TEXT,
  matched_model TEXT,
  year_start INTEGER,
  year_end INTEGER,
  city_consumption_rate NUMERIC,
  highway_consumption_rate NUMERIC,
  idle_consumption_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_make TEXT := lower(trim(coalesce(p_make, '')));
  v_model TEXT := lower(trim(coalesce(p_model, '')));
BEGIN
  IF v_make = '' OR v_model = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      c.id,
      c.brand,
      c.model,
      c.year_start,
      c.year_end,
      c.city_consumption_rate,
      c.highway_consumption_rate,
      c.idle_consumption_rate,
      similarity(lower(c.brand), v_make) AS make_sim,
      similarity(lower(c.model), v_model) AS model_sim,
      CASE
        WHEN p_year IS NULL THEN 0.05
        WHEN c.year_start IS NULL AND c.year_end IS NULL THEN 0.07
        WHEN c.year_start IS NOT NULL AND c.year_end IS NOT NULL AND p_year BETWEEN c.year_start AND c.year_end THEN 0.10
        WHEN c.year_start IS NOT NULL AND c.year_end IS NULL AND p_year >= c.year_start THEN 0.08
        WHEN c.year_start IS NULL AND c.year_end IS NOT NULL AND p_year <= c.year_end THEN 0.08
        ELSE 0.0
      END AS year_bonus,
      (
        0.35 * similarity(lower(c.brand), v_make)
        + 0.55 * similarity(lower(c.model), v_model)
        + CASE
            WHEN p_year IS NULL THEN 0.05
            WHEN c.year_start IS NULL AND c.year_end IS NULL THEN 0.07
            WHEN c.year_start IS NOT NULL AND c.year_end IS NOT NULL AND p_year BETWEEN c.year_start AND c.year_end THEN 0.10
            WHEN c.year_start IS NOT NULL AND c.year_end IS NULL AND p_year >= c.year_start THEN 0.08
            WHEN c.year_start IS NULL AND c.year_end IS NOT NULL AND p_year <= c.year_end THEN 0.08
            ELSE 0.0
          END
      )::NUMERIC AS weighted_score
    FROM public.vehicle_fuel_specs_catalog c
    WHERE c.is_active = true
      AND (
        lower(c.brand) % v_make
        OR lower(c.model) % v_model
        OR lower(c.normalized_key) = (v_make || '|' || v_model)
      )
  )
  SELECT
    id,
    weighted_score,
    brand,
    model,
    candidates.year_start,
    candidates.year_end,
    candidates.city_consumption_rate,
    candidates.highway_consumption_rate,
    candidates.idle_consumption_rate
  FROM candidates
  WHERE weighted_score >= 0.58
  ORDER BY weighted_score DESC, model_sim DESC, make_sim DESC
  LIMIT 1;
END;
$$;

-- 5) Apply profile helper and trigger.
CREATE OR REPLACE FUNCTION public.apply_vehicle_fuel_profile(
  p_device_id TEXT,
  p_make TEXT,
  p_model TEXT,
  p_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
BEGIN
  SELECT *
  INTO v_match
  FROM public.match_vehicle_to_catalog(p_make, p_model, p_year)
  LIMIT 1;

  IF v_match.catalog_id IS NULL THEN
    UPDATE public.vehicles
    SET
      fuel_profile_id = NULL,
      fuel_metadata = jsonb_build_object(
        'matched', false,
        'requested_make', p_make,
        'requested_model', p_model,
        'requested_year', p_year,
        'matched_at', now()
      )
    WHERE device_id = p_device_id;

    RETURN;
  END IF;

  UPDATE public.vehicles
  SET
    fuel_profile_id = v_match.catalog_id,
    fuel_metadata = jsonb_build_object(
      'matched', true,
      'match_score', v_match.score,
      'catalog_id', v_match.catalog_id,
      'brand', v_match.matched_brand,
      'model', v_match.matched_model,
      'year_start', v_match.year_start,
      'year_end', v_match.year_end,
      'city_consumption_rate', v_match.city_consumption_rate,
      'highway_consumption_rate', v_match.highway_consumption_rate,
      'idle_consumption_rate', v_match.idle_consumption_rate,
      'matched_at', now()
    )
  WHERE device_id = p_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vehicle_apply_fuel_profile_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_vehicle_fuel_profile(NEW.device_id, NEW.make, NEW.model, NEW.year);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_apply_fuel_profile ON public.vehicles;
CREATE TRIGGER trg_vehicle_apply_fuel_profile
AFTER INSERT OR UPDATE OF make, model, year
ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.vehicle_apply_fuel_profile_trigger();

-- 6) Re-sync RPC (admin only).
CREATE OR REPLACE FUNCTION public.resync_all_vehicle_fuel_profiles(p_limit INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER := 0;
  v_matched INTEGER := 0;
  v_unmatched INTEGER := 0;
  v_row RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can resync vehicle fuel profiles';
  END IF;

  FOR v_row IN
    SELECT device_id, make, model, year
    FROM public.vehicles
    WHERE NULLIF(trim(make), '') IS NOT NULL
      AND NULLIF(trim(model), '') IS NOT NULL
    ORDER BY created_at DESC
    LIMIT COALESCE(p_limit, 1000000)
  LOOP
    v_total := v_total + 1;
    PERFORM public.apply_vehicle_fuel_profile(v_row.device_id, v_row.make, v_row.model, v_row.year);

    IF EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.device_id = v_row.device_id
        AND v.fuel_profile_id IS NOT NULL
    ) THEN
      v_matched := v_matched + 1;
    ELSE
      v_unmatched := v_unmatched + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_total,
    'matched', v_matched,
    'unmatched', v_unmatched
  );
END;
$$;

-- 7) Extend trip analytics persistence for fuel.
ALTER TABLE public.trip_analytics
ADD COLUMN IF NOT EXISTS total_fuel_consumed_l NUMERIC,
ADD COLUMN IF NOT EXISTS estimated_fuel_cost NUMERIC,
ADD COLUMN IF NOT EXISTS fuel_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;
