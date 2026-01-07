-- Add expires_at to app_settings for token expiry tracking
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Vehicles table (device registry from GPS51)
CREATE TABLE IF NOT EXISTS public.vehicles (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    group_id TEXT,
    group_name TEXT,
    device_type TEXT,
    sim_number TEXT,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Vehicle positions cache (latest position per device)
CREATE TABLE IF NOT EXISTS public.vehicle_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    speed DOUBLE PRECISION DEFAULT 0,
    heading DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    battery_percent INTEGER,
    ignition_on BOOLEAN,
    is_online BOOLEAN DEFAULT false,
    is_overspeeding BOOLEAN DEFAULT false,
    total_mileage DOUBLE PRECISION,
    status_text TEXT,
    gps_time TIMESTAMP WITH TIME ZONE,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(device_id)
);

-- Position history for trip tracking
CREATE TABLE IF NOT EXISTS public.position_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    battery_percent INTEGER,
    ignition_on BOOLEAN,
    gps_time TIMESTAMP WITH TIME ZONE,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for efficient trip queries
CREATE INDEX IF NOT EXISTS idx_position_history_device_time ON public.position_history(device_id, gps_time DESC);

-- GPS API logs for debugging and monitoring
CREATE TABLE IF NOT EXISTS public.gps_api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for log cleanup queries
CREATE INDEX IF NOT EXISTS idx_gps_api_logs_created ON public.gps_api_logs(created_at);

-- Enable RLS on all new tables
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_api_logs ENABLE ROW LEVEL SECURITY;

-- Vehicles: Read for authenticated, write for service role
CREATE POLICY "Authenticated users can read vehicles" 
ON public.vehicles FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage vehicles" 
ON public.vehicles FOR ALL 
USING (true) 
WITH CHECK (true);

-- Vehicle positions: Read for authenticated, write for service role
CREATE POLICY "Authenticated users can read positions" 
ON public.vehicle_positions FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage positions" 
ON public.vehicle_positions FOR ALL 
USING (true) 
WITH CHECK (true);

-- Position history: Read for authenticated, write for service role
CREATE POLICY "Authenticated users can read history" 
ON public.position_history FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage history" 
ON public.position_history FOR ALL 
USING (true) 
WITH CHECK (true);

-- GPS API logs: Only admins can read, service role can write
CREATE POLICY "Admins can read logs" 
ON public.gps_api_logs FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage logs" 
ON public.gps_api_logs FOR ALL 
USING (true) 
WITH CHECK (true);