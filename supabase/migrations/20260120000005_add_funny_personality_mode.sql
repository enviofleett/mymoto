-- Add 'funny' personality mode to vehicle_llm_settings CHECK constraint
-- The code supports 'funny' but the database constraint was missing it

-- Drop the old constraint
ALTER TABLE public.vehicle_llm_settings
DROP CONSTRAINT IF EXISTS vehicle_llm_settings_personality_mode_check;

-- Add the new constraint with 'funny' included
ALTER TABLE public.vehicle_llm_settings
ADD CONSTRAINT vehicle_llm_settings_personality_mode_check 
CHECK (personality_mode IN ('casual', 'professional', 'funny'));

-- Update the comment to match
COMMENT ON COLUMN public.vehicle_llm_settings.personality_mode IS 
'Supported values: casual, professional, funny';
