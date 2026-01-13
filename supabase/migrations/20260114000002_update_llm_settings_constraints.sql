-- Update CHECK constraints for vehicle_llm_settings to include 'funny' personality and 'french' language
-- This fixes the constraint violation errors when saving these settings

-- Drop existing CHECK constraints
ALTER TABLE public.vehicle_llm_settings 
DROP CONSTRAINT IF EXISTS vehicle_llm_settings_personality_mode_check;

ALTER TABLE public.vehicle_llm_settings 
DROP CONSTRAINT IF EXISTS vehicle_llm_settings_language_preference_check;

-- Add updated CHECK constraints with all supported values
ALTER TABLE public.vehicle_llm_settings 
ADD CONSTRAINT vehicle_llm_settings_personality_mode_check 
CHECK (personality_mode IN ('casual', 'professional', 'funny'));

ALTER TABLE public.vehicle_llm_settings 
ADD CONSTRAINT vehicle_llm_settings_language_preference_check 
CHECK (language_preference IN ('english', 'pidgin', 'yoruba', 'hausa', 'igbo', 'french'));

-- Update comments to reflect all supported values
COMMENT ON COLUMN public.vehicle_llm_settings.personality_mode IS 'Supported values: casual, professional, funny';
COMMENT ON COLUMN public.vehicle_llm_settings.language_preference IS 'Supported values: english, pidgin, yoruba, hausa, igbo, french';
