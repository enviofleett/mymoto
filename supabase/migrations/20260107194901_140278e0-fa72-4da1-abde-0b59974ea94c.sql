-- Create table for storing fleet insights history
CREATE TABLE public.fleet_insights_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    vehicles_analyzed INTEGER NOT NULL DEFAULT 0,
    alerts_count INTEGER NOT NULL DEFAULT 0,
    overspeeding_count INTEGER NOT NULL DEFAULT 0,
    low_battery_count INTEGER NOT NULL DEFAULT 0,
    offline_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fleet_insights_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read insights
CREATE POLICY "Authenticated users can read insights"
ON public.fleet_insights_history FOR SELECT
TO authenticated
USING (true);

-- Service role can manage insights
CREATE POLICY "Service role can manage insights"
ON public.fleet_insights_history FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Index for time-based queries
CREATE INDEX idx_fleet_insights_created_at 
ON public.fleet_insights_history(created_at DESC);