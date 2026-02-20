-- Migration: Sync vehicle_specifications → vehicle_mileage_details + vehicles
-- When a user saves vehicle specs (brand, model, year, manufacturer fuel consumption),
-- this trigger:
--   1. Updates estimated_fuel_consumption_* in vehicle_mileage_details for that device
--      so the fuel monitoring cards immediately reflect the saved specs.
--   2. Syncs make, model, year, fuel_type, and official_fuel_efficiency to the vehicles
--      table so catalog lookups and backfills stay consistent.

CREATE OR REPLACE FUNCTION public.sync_vehicle_specs_to_related_tables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- -----------------------------------------------------------------------
  -- 1. Update vehicle_mileage_details with age-adjusted fuel estimates.
  --    Rows that already have GPS51 actual data (oilper100km IS NOT NULL)
  --    get their variance recalculated too.
  -- -----------------------------------------------------------------------
  IF NEW.estimated_current_fuel_consumption IS NOT NULL THEN
    UPDATE public.vehicle_mileage_details
    SET
      estimated_fuel_consumption_combined = NEW.estimated_current_fuel_consumption,
      -- Recalculate variance for rows that have GPS51 actual data
      fuel_consumption_variance = CASE
        WHEN oilper100km IS NOT NULL AND NEW.estimated_current_fuel_consumption > 0
          THEN ROUND(
            ((oilper100km - NEW.estimated_current_fuel_consumption) / NEW.estimated_current_fuel_consumption) * 100,
            2
          )
        ELSE fuel_consumption_variance
      END
    WHERE device_id = NEW.device_id;

    -- Update city/highway estimates where available
    IF NEW.manufacturer_fuel_consumption_city IS NOT NULL THEN
      UPDATE public.vehicle_mileage_details
      SET estimated_fuel_consumption_city =
        ROUND(
          (NEW.manufacturer_fuel_consumption_city *
           POWER(1.0 + COALESCE(NEW.fuel_consumption_degradation_per_year, 0.02),
                 COALESCE(NEW.vehicle_age_years, 0)))::NUMERIC,
          2
        )
      WHERE device_id = NEW.device_id;
    END IF;

    IF NEW.manufacturer_fuel_consumption_highway IS NOT NULL THEN
      UPDATE public.vehicle_mileage_details
      SET estimated_fuel_consumption_highway =
        ROUND(
          (NEW.manufacturer_fuel_consumption_highway *
           POWER(1.0 + COALESCE(NEW.fuel_consumption_degradation_per_year, 0.02),
                 COALESCE(NEW.vehicle_age_years, 0)))::NUMERIC,
          2
        )
      WHERE device_id = NEW.device_id;
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Sync key fields to the vehicles table so catalog lookups are accurate.
  --    Only overwrite when the incoming value is non-empty, so we never
  --    blank out a previously set value.
  -- -----------------------------------------------------------------------
  UPDATE public.vehicles
  SET
    make   = COALESCE(NULLIF(TRIM(NEW.brand), ''),  make),
    model  = COALESCE(NULLIF(TRIM(COALESCE(NEW.model, '')), ''), model),
    year   = COALESCE(NEW.year_of_manufacture,        year),
    fuel_type = COALESCE(NULLIF(TRIM(COALESCE(NEW.engine_type, '')), ''), fuel_type),
    official_fuel_efficiency_l_100km = COALESCE(
      NEW.manufacturer_fuel_consumption_combined,
      official_fuel_efficiency_l_100km
    )
  WHERE device_id = NEW.device_id;

  RETURN NEW;
END;
$$;

-- Drop old trigger if it exists from any previous attempt, then recreate.
DROP TRIGGER IF EXISTS sync_specs_to_fuel_tables_trigger ON public.vehicle_specifications;

CREATE TRIGGER sync_specs_to_fuel_tables_trigger
AFTER INSERT OR UPDATE ON public.vehicle_specifications
FOR EACH ROW
EXECUTE FUNCTION public.sync_vehicle_specs_to_related_tables();

COMMENT ON FUNCTION public.sync_vehicle_specs_to_related_tables() IS
  'Propagates vehicle_specifications saves to vehicle_mileage_details (estimated fuel columns + variance) '
  'and to vehicles (make, model, year, fuel_type, official_fuel_efficiency_l_100km). '
  'Runs after INSERT or UPDATE on vehicle_specifications.';
