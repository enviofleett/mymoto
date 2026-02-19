-- Backfill official fuel efficiency for existing vehicles from catalog when missing.
WITH catalog AS (
  SELECT normalized_key, official_fuel_efficiency_l_100km
  FROM public.vehicle_fuel_specs_catalog
  WHERE is_active = true
), vehicle_keys AS (
  SELECT
    v.device_id,
    lower(trim(COALESCE(NULLIF(v.make, ''), NULLIF(v.brand, '')))) || '|' || lower(trim(v.model)) AS normalized_key
  FROM public.vehicles v
  WHERE v.official_fuel_efficiency_l_100km IS NULL
    AND COALESCE(NULLIF(v.make, ''), NULLIF(v.brand, '')) IS NOT NULL
    AND NULLIF(trim(v.model), '') IS NOT NULL
)
UPDATE public.vehicles v
SET
  official_fuel_efficiency_l_100km = c.official_fuel_efficiency_l_100km
FROM vehicle_keys vk
JOIN catalog c ON c.normalized_key = vk.normalized_key
WHERE v.device_id = vk.device_id
  AND v.official_fuel_efficiency_l_100km IS NULL;
