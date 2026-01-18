-- Vehicle Deletion Audit Log
-- Tracks all vehicle deletions for compliance and accountability

CREATE TABLE IF NOT EXISTS public.vehicle_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  days_inactive INTEGER NOT NULL,
  deletion_method TEXT NOT NULL CHECK (deletion_method IN ('manual', 'automated', 'cleanup')),
  vehicles_deleted INTEGER NOT NULL DEFAULT 0,
  assignments_deleted INTEGER NOT NULL DEFAULT 0,
  trips_deleted INTEGER NOT NULL DEFAULT 0,
  device_ids TEXT[] NOT NULL DEFAULT '{}',
  batch_size INTEGER,
  execution_time_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_vehicle_deletion_log_deleted_by ON public.vehicle_deletion_log(deleted_by);
CREATE INDEX IF NOT EXISTS idx_vehicle_deletion_log_deleted_at ON public.vehicle_deletion_log(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_deletion_log_success ON public.vehicle_deletion_log(success);

-- Enable RLS
ALTER TABLE public.vehicle_deletion_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all deletion logs
CREATE POLICY "Admins can view all deletion logs"
ON public.vehicle_deletion_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policy: Users can view their own deletion logs
CREATE POLICY "Users can view their own deletion logs"
ON public.vehicle_deletion_log
FOR SELECT
TO authenticated
USING (auth.uid() = deleted_by);

-- RLS Policy: Service role can insert (for edge functions)
-- Service role bypasses RLS, but we document it here

-- Comment for documentation
COMMENT ON TABLE public.vehicle_deletion_log IS 
'Audit log of all vehicle deletions. Tracks who deleted what, when, and why. Used for compliance and accountability.';

COMMENT ON COLUMN public.vehicle_deletion_log.deletion_method IS 
'Method of deletion: manual (admin UI), automated (scheduled cleanup), or cleanup (data cleanup job)';

COMMENT ON COLUMN public.vehicle_deletion_log.metadata IS 
'Additional metadata about the deletion operation (e.g., IP address, user agent, etc.)';
