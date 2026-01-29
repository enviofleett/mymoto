-- Add support for retrying failed edge function calls
-- This migration creates a table to track failed notifications for retry

-- Table to track failed edge function calls for retry
CREATE TABLE IF NOT EXISTS public.edge_function_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  event_id UUID REFERENCES public.proactive_vehicle_events(id) ON DELETE CASCADE,
  device_id TEXT,
  error_message TEXT,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_edge_function_errors_unresolved 
ON public.edge_function_errors(function_name, resolved, created_at DESC) 
WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_edge_function_errors_event 
ON public.edge_function_errors(event_id) 
WHERE event_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.edge_function_errors ENABLE ROW LEVEL SECURITY;

-- Service role can manage all error logs
DROP POLICY IF EXISTS "Service role can manage error logs" ON public.edge_function_errors;
CREATE POLICY "Service role can manage error logs"
ON public.edge_function_errors FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users cannot see error logs (privacy)
DROP POLICY IF EXISTS "Users cannot see error logs" ON public.edge_function_errors;
CREATE POLICY "Users cannot see error logs"
ON public.edge_function_errors FOR SELECT
TO authenticated
USING (false);

-- Function to get failed events that need retry
CREATE OR REPLACE FUNCTION get_failed_events_for_retry(
  p_function_name TEXT DEFAULT 'proactive-alarm-to-chat',
  p_max_retries INTEGER DEFAULT 3,
  p_max_age_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  error_id UUID,
  event_id UUID,
  device_id TEXT,
  retry_count INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id AS error_id,
    e.event_id,
    e.device_id,
    e.retry_count,
    e.error_message
  FROM public.edge_function_errors e
  WHERE
    e.function_name = p_function_name
    AND e.resolved = false
    AND e.retry_count < p_max_retries
    AND e.created_at >= now() - (p_max_age_hours || ' hours')::INTERVAL
  ORDER BY e.created_at ASC
  LIMIT 50;
END;
$$;

-- Function to mark error as resolved
CREATE OR REPLACE FUNCTION mark_error_resolved(
  p_error_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.edge_function_errors
  SET resolved = true
  WHERE id = p_error_id;
  
  RETURN FOUND;
END;
$$;

-- Function to increment retry count
CREATE OR REPLACE FUNCTION increment_retry_count(
  p_error_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.edge_function_errors
  SET 
    retry_count = retry_count + 1,
    last_retry_at = now()
  WHERE id = p_error_id;
  
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION get_failed_events_for_retry TO service_role;
GRANT EXECUTE ON FUNCTION mark_error_resolved TO service_role;
GRANT EXECUTE ON FUNCTION increment_retry_count TO service_role;

COMMENT ON TABLE public.edge_function_errors IS 'Tracks failed edge function calls for monitoring and retry purposes';
COMMENT ON FUNCTION get_failed_events_for_retry IS 'Returns failed events that can be retried, filtered by max retries and age';
COMMENT ON FUNCTION mark_error_resolved IS 'Marks an error as resolved after successful retry';
COMMENT ON FUNCTION increment_retry_count IS 'Increments the retry count when a retry is attempted';
