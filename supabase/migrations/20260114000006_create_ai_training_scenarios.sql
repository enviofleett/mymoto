-- AI Training Scenarios System
-- Allows admins to train the AI on how to respond to specific types of questions

CREATE TABLE public.ai_training_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scenario identification
  name TEXT NOT NULL,
  description TEXT,
  scenario_type TEXT NOT NULL, -- e.g., 'location_query', 'battery_status', 'maintenance', 'trip_history', 'general'
  
  -- Question patterns (keywords/phrases that trigger this scenario)
  question_patterns TEXT[] NOT NULL DEFAULT '{}', -- Array of keywords/phrases
  question_examples TEXT[], -- Example questions for this scenario
  
  -- Response guidance
  response_guidance TEXT NOT NULL, -- Instructions for how AI should respond
  response_examples TEXT[], -- Example responses
  
  -- Context requirements
  requires_location BOOLEAN DEFAULT false,
  requires_battery_status BOOLEAN DEFAULT false,
  requires_trip_data BOOLEAN DEFAULT false,
  requires_vehicle_status BOOLEAN DEFAULT false,
  
  -- Priority (higher priority scenarios are checked first)
  priority INTEGER DEFAULT 50,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 100)
);

-- Indexes for efficient querying
CREATE INDEX idx_ai_scenarios_type ON public.ai_training_scenarios(scenario_type, is_active);
CREATE INDEX idx_ai_scenarios_priority ON public.ai_training_scenarios(priority DESC, is_active);
CREATE INDEX idx_ai_scenarios_active ON public.ai_training_scenarios(is_active) WHERE is_active = true;
CREATE INDEX idx_ai_scenarios_tags ON public.ai_training_scenarios USING GIN(tags);

-- Enable RLS
ALTER TABLE public.ai_training_scenarios ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Everyone can read active scenarios (needed for AI to use them)
CREATE POLICY "Anyone can read active scenarios"
ON public.ai_training_scenarios
FOR SELECT
USING (is_active = true);

-- Admins can manage all scenarios
CREATE POLICY "Admins can manage scenarios"
ON public.ai_training_scenarios
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage scenarios (for edge functions)
CREATE POLICY "Service role can manage scenarios"
ON public.ai_training_scenarios
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_ai_scenarios_updated_at
BEFORE UPDATE ON public.ai_training_scenarios
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();

-- Comments
COMMENT ON TABLE public.ai_training_scenarios IS 'Stores AI training scenarios that guide how the vehicle AI responds to different types of questions';
COMMENT ON COLUMN public.ai_training_scenarios.scenario_type IS 'Category of scenario: location_query, battery_status, maintenance, trip_history, general, etc.';
COMMENT ON COLUMN public.ai_training_scenarios.question_patterns IS 'Array of keywords/phrases that trigger this scenario';
COMMENT ON COLUMN public.ai_training_scenarios.response_guidance IS 'Instructions for how the AI should respond to questions matching this scenario';
COMMENT ON COLUMN public.ai_training_scenarios.priority IS 'Priority level (0-100). Higher priority scenarios are checked first.';

-- Insert some default scenarios
INSERT INTO public.ai_training_scenarios (name, description, scenario_type, question_patterns, question_examples, response_guidance, response_examples, priority, created_by)
VALUES
  (
    'Location Queries',
    'How to respond when user asks about vehicle location',
    'location_query',
    ARRAY['where', 'location', 'position', 'address', 'at', 'current location'],
    ARRAY['Where are you?', 'What is your current location?', 'Where am I?'],
    'Always include the current location with coordinates. Use the [LOCATION: lat, lon, "address"] tag format. Be specific about the address if available. Include timestamp of when location was last updated.',
    ARRAY['I''m currently at [LOCATION: 6.5244, 3.3792, "Victoria Island, Lagos"]', 'As of 2:30 PM, I''m at [LOCATION: 6.5209, 3.3267, "Ikeja, Lagos"]'],
    90,
    NULL
  ),
  (
    'Battery Status',
    'How to respond when user asks about battery level',
    'battery_status',
    ARRAY['battery', 'charge', 'power', 'energy', 'low battery'],
    ARRAY['What is my battery level?', 'How much charge do I have?', 'Is my battery low?'],
    'Always mention the exact battery percentage. If below 20%, proactively warn about low battery. If below 10%, emphasize urgency. Suggest charging location if available.',
    ARRAY['My battery is at 45%. Still good for a while!', '⚠️ Battery is at 15% - you should charge soon!', '🚨 Critical: Battery at 8% - find a charger immediately!'],
    85,
    NULL
  ),
  (
    'Trip History',
    'How to respond when user asks about past trips',
    'trip_history',
    ARRAY['trip', 'journey', 'drive', 'traveled', 'distance', 'today', 'yesterday', 'last'],
    ARRAY['How many trips did I take today?', 'What was my last trip?', 'How far did I travel?'],
    'Provide trip count, total distance, and key details. Mention start/end locations if available. Keep it concise but informative. Use trip numbers (Trip 1, Trip 2, etc.)',
    ARRAY['You took 3 trips today covering 45.2km total. Trip 1 was the longest at 28km.', 'Your last trip was 12km from Ikeja to Victoria Island, completed at 3:45 PM.'],
    80,
    NULL
  ),
  (
    'Maintenance Reminders',
    'How to respond when user asks about maintenance',
    'maintenance',
    ARRAY['maintenance', 'service', 'repair', 'checkup', 'oil', 'tire', 'brake'],
    ARRAY['When is my next service due?', 'Do I need maintenance?', 'What maintenance do I need?'],
    'Be helpful and proactive. If maintenance is due, clearly state what needs attention and when. Provide actionable advice. Use a friendly but concerned tone.',
    ARRAY['Your next service is due in 2,500km or 3 months. Everything else looks good!', '⚠️ Oil change is overdue by 500km. I recommend scheduling service soon.'],
    75,
    NULL
  ),
  (
    'Speed and Safety',
    'How to respond when user asks about speed or safety',
    'safety',
    ARRAY['speed', 'fast', 'slow', 'overspeed', 'safety', 'safe'],
    ARRAY['How fast am I going?', 'Am I overspeeding?', 'Is it safe?'],
    'If overspeeding, express concern in a friendly way. Provide current speed and speed limit if available. Emphasize safety without being preachy.',
    ARRAY['Currently at 65km/h - all good!', '⚠️ You''re at 95km/h in a 60km/h zone. Please slow down for safety!'],
    70,
    NULL
  )
ON CONFLICT DO NOTHING;
