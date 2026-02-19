-- Backfill make from brand for compatibility with new vehicle settings flow.
-- Canonical field going forward is public.vehicles.make.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'make'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'brand'
  ) THEN
    UPDATE public.vehicles
    SET make = COALESCE(make, brand)
    WHERE make IS NULL
      AND brand IS NOT NULL;
  END IF;
END $$;
