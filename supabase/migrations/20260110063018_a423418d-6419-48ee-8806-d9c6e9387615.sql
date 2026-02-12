-- Create proactive_vehicle_events table for persistent alert tracking
CREATE TABLE IF NOT EXISTS public.proactive_vehicle_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_proactive_events_device_id ON public.proactive_vehicle_events(device_id);
CREATE INDEX IF NOT EXISTS idx_proactive_events_event_type ON public.proactive_vehicle_events(event_type);
CREATE INDEX IF NOT EXISTS idx_proactive_events_severity ON public.proactive_vehicle_events(severity);
CREATE INDEX IF NOT EXISTS idx_proactive_events_created_at ON public.proactive_vehicle_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_events_acknowledged ON public.proactive_vehicle_events(acknowledged) WHERE acknowledged = false;

-- Enable Row Level Security
ALTER TABLE public.proactive_vehicle_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Authenticated users can read all events
DROP POLICY IF EXISTS "Authenticated users can read events" ON public.proactive_vehicle_events;
CREATE POLICY "Authenticated users can read events"
ON public.proactive_vehicle_events
FOR SELECT
USING (true);

-- Admins can manage all events (insert, update, delete)
DROP POLICY IF EXISTS "Admins can manage events" ON public.proactive_vehicle_events;
CREATE POLICY "Admins can manage events"
ON public.proactive_vehicle_events
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role can manage events (for edge functions)
DROP POLICY IF EXISTS "Service role can manage events" ON public.proactive_vehicle_events;
CREATE POLICY "Service role can manage events"
ON public.proactive_vehicle_events
FOR ALL
USING (true)
WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.proactive_vehicle_events IS 'Stores proactive vehicle alerts and events for historical tracking';
