-- Vehicle LLM/Companion Settings
CREATE TABLE public.vehicle_llm_settings (
    device_id TEXT PRIMARY KEY,
    nickname TEXT,
    language_preference TEXT DEFAULT 'english' CHECK (language_preference IN ('english', 'pidgin', 'yoruba', 'hausa', 'igbo')),
    personality_mode TEXT DEFAULT 'casual' CHECK (personality_mode IN ('casual', 'professional')),
    llm_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vehicle_llm_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read llm settings"
ON public.vehicle_llm_settings
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage llm settings"
ON public.vehicle_llm_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_vehicle_llm_settings_updated_at
BEFORE UPDATE ON public.vehicle_llm_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();