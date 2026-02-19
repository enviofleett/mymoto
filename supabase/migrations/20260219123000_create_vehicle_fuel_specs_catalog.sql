-- Canonical fuel specs catalog by brand/model/variant
CREATE TABLE IF NOT EXISTS public.vehicle_fuel_specs_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  variant TEXT,
  normalized_key TEXT NOT NULL,
  fuel_type TEXT,
  engine_displacement TEXT,
  official_fuel_efficiency_l_100km FLOAT NOT NULL CHECK (official_fuel_efficiency_l_100km > 0 AND official_fuel_efficiency_l_100km <= 40),
  vehicle_type TEXT,
  usage_weight TEXT,
  test_cycle TEXT NOT NULL DEFAULT 'WLTP_combined',
  market_region TEXT NOT NULL DEFAULT 'Africa',
  source_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_fuel_specs_catalog_normalized_key
  ON public.vehicle_fuel_specs_catalog(normalized_key);

CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_specs_catalog_brand_model
  ON public.vehicle_fuel_specs_catalog(brand, model);

ALTER TABLE public.vehicle_fuel_specs_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read fuel specs catalog" ON public.vehicle_fuel_specs_catalog;
CREATE POLICY "Authenticated users can read fuel specs catalog"
ON public.vehicle_fuel_specs_catalog FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Service role can manage fuel specs catalog" ON public.vehicle_fuel_specs_catalog;
CREATE POLICY "Service role can manage fuel specs catalog"
ON public.vehicle_fuel_specs_catalog FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.vehicle_fuel_specs_catalog IS 'Canonical brand/model/variant fuel specs catalog used to auto-fill vehicle fuel profiles.';
COMMENT ON COLUMN public.vehicle_fuel_specs_catalog.normalized_key IS 'Lookup key format: lowercase(trim(brand)) || ''|'' || lowercase(trim(model_or_variant)).';
COMMENT ON COLUMN public.vehicle_fuel_specs_catalog.test_cycle IS 'Fuel-test standard used for the stored value (default: WLTP_combined).';
