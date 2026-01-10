-- Add avatar_url column to vehicle_llm_settings if it doesn't exist
ALTER TABLE public.vehicle_llm_settings 
ADD COLUMN IF NOT EXISTS avatar_url text;

-- Note: PostgreSQL text columns don't have check constraints by default for enum-like values
-- The language_preference and personality_mode are just text columns
-- We'll add comments to document the new valid values

COMMENT ON COLUMN public.vehicle_llm_settings.language_preference IS 'Supported values: english, pidgin, yoruba, hausa, igbo, french';
COMMENT ON COLUMN public.vehicle_llm_settings.personality_mode IS 'Supported values: casual, professional, funny';
COMMENT ON COLUMN public.vehicle_llm_settings.avatar_url IS 'URL or path to custom vehicle avatar image';