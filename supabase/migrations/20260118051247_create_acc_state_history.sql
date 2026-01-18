-- Create ACC State History table for storing GPS51 ACC report data
-- This table stores authoritative ignition state changes from GPS51's reportaccsbytime API

CREATE TABLE IF NOT EXISTS public.acc_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
  acc_state TEXT NOT NULL CHECK (acc_state IN ('ON', 'OFF')),
  begin_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  start_latitude DOUBLE PRECISION,
  start_longitude DOUBLE PRECISION,
  end_latitude DOUBLE PRECISION,
  end_longitude DOUBLE PRECISION,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'gps51_api' CHECK (source IN ('gps51_api', 'inferred')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_acc_history_device_time 
  ON public.acc_state_history(device_id, begin_time DESC);
  
CREATE INDEX IF NOT EXISTS idx_acc_history_device_state 
  ON public.acc_state_history(device_id, acc_state, begin_time DESC);

-- Index for finding state changes within time ranges
CREATE INDEX IF NOT EXISTS idx_acc_history_time_range 
  ON public.acc_state_history(begin_time, end_time);

-- Enable RLS
ALTER TABLE public.acc_state_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Authenticated users can read ACC state history for their assigned vehicles
CREATE POLICY "Authenticated users can read ACC state history"
  ON public.acc_state_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicle_assignments va
      WHERE va.device_id = acc_state_history.device_id
      AND va.profile_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Service role can manage all ACC state history
CREATE POLICY "Service role can manage ACC state history"
  ON public.acc_state_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.acc_state_history IS 'Stores ACC (ignition) state changes from GPS51 API and inferred states from position data';
COMMENT ON COLUMN public.acc_state_history.acc_state IS 'ACC state: ON or OFF';
COMMENT ON COLUMN public.acc_state_history.begin_time IS 'When the ACC state began';
COMMENT ON COLUMN public.acc_state_history.end_time IS 'When the ACC state ended';
COMMENT ON COLUMN public.acc_state_history.source IS 'Source of data: gps51_api (authoritative) or inferred (from position history)';
