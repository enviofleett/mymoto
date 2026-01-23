-- Update CHECK constraints for vehicle_llm_settings to include 'funny' personality mode
-- This fixes the constraint violation error when users select 'funny' personality

-- Drop existing constraints (PostgreSQL auto-generates names, so we need to find and drop them)
DO $$ 
DECLARE
    constraint_name text;
BEGIN
    -- Find and drop language_preference constraint
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.vehicle_llm_settings'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%language_preference%';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.vehicle_llm_settings DROP CONSTRAINT %I', constraint_name);
    END IF;
    
    -- Find and drop personality_mode constraint
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.vehicle_llm_settings'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%personality_mode%';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.vehicle_llm_settings DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Recreate constraints with updated values
ALTER TABLE public.vehicle_llm_settings 
ADD CONSTRAINT vehicle_llm_settings_language_preference_check 
CHECK (language_preference IN ('english', 'pidgin', 'yoruba', 'hausa', 'igbo'));

ALTER TABLE public.vehicle_llm_settings 
ADD CONSTRAINT vehicle_llm_settings_personality_mode_check 
CHECK (personality_mode IN ('casual', 'professional', 'funny'));
