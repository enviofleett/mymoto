-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table for AI scenario templates
CREATE TABLE public.ai_scenario_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_by UUID REFERENCES auth.users(id),
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_scenario_templates ENABLE ROW LEVEL SECURITY;

-- Admins can view all templates
CREATE POLICY "Admins can view all templates"
ON public.ai_scenario_templates
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Admins can create templates
CREATE POLICY "Admins can create templates"
ON public.ai_scenario_templates
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Admins can update their own templates (not system ones)
CREATE POLICY "Admins can update non-system templates"
ON public.ai_scenario_templates
FOR UPDATE
USING (
  is_system = false AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Admins can delete non-system templates
CREATE POLICY "Admins can delete non-system templates"
ON public.ai_scenario_templates
FOR DELETE
USING (
  is_system = false AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Insert default system templates
INSERT INTO public.ai_scenario_templates (name, prompt, category, is_system) VALUES
  ('Location Check', 'Where are you right now? Give me a map link.', 'location', true),
  ('Battery & Maintenance', 'How is my battery health and tire pressure?', 'maintenance', true),
  ('Driving History', 'Did I have any harsh braking events yesterday?', 'analytics', true),
  ('Lock Doors Command', 'Lock the doors.', 'command', true),
  ('Unlock Doors Command', 'Unlock the doors.', 'command', true),
  ('Personality Test', 'Tell me a joke about this car.', 'personality', true),
  ('Trip Summary', 'Summarize my trips from today.', 'analytics', true),
  ('Speed Check', 'What was my top speed this week?', 'analytics', true);

-- Add trigger for updated_at
CREATE TRIGGER update_ai_scenario_templates_updated_at
BEFORE UPDATE ON public.ai_scenario_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();