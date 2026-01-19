-- Ensure llm_enabled is never null and defaults to true
-- This prevents auto-disabling of AI companion

-- Step 1: Update any existing NULL values to true (default enabled)
UPDATE public.vehicle_llm_settings
SET llm_enabled = true
WHERE llm_enabled IS NULL;

-- Step 2: Add NOT NULL constraint to prevent future NULL values
ALTER TABLE public.vehicle_llm_settings
ALTER COLUMN llm_enabled SET NOT NULL;

-- Step 3: Ensure default is explicitly true (redundant but explicit)
ALTER TABLE public.vehicle_llm_settings
ALTER COLUMN llm_enabled SET DEFAULT true;

-- Add comment explaining the constraint
COMMENT ON COLUMN public.vehicle_llm_settings.llm_enabled IS 
'Whether AI companion is enabled for this vehicle. Defaults to true (enabled). Only users can explicitly disable it.';
