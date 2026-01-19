-- =====================================================
-- FIX MISSING TABLES AND COLUMNS
-- Run this to add all missing components for retry system
-- =====================================================

-- STEP 1: Create edge_function_errors table if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'edge_function_errors'
  ) THEN
    -- Create the table
    CREATE TABLE public.edge_function_errors (
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

    -- Create indexes
    CREATE INDEX idx_edge_function_errors_unresolved 
    ON public.edge_function_errors(function_name, resolved, created_at DESC) 
    WHERE resolved = false;

    CREATE INDEX idx_edge_function_errors_event 
    ON public.edge_function_errors(event_id) 
    WHERE event_id IS NOT NULL;

    -- Enable RLS
    ALTER TABLE public.edge_function_errors ENABLE ROW LEVEL SECURITY;

    -- Service role can manage all error logs
    CREATE POLICY "Service role can manage error logs"
    ON public.edge_function_errors FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    -- Users cannot see error logs (privacy)
    CREATE POLICY "Users cannot see error logs"
    ON public.edge_function_errors FOR SELECT
    TO authenticated
    USING (false);

    RAISE NOTICE '✅ Created edge_function_errors table';
  ELSE
    RAISE NOTICE '✅ edge_function_errors table already exists';
  END IF;
END $$;

-- STEP 2: Add notified and notified_at columns if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' 
    AND column_name = 'notified'
  ) THEN
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN notified BOOLEAN DEFAULT false;
    
    RAISE NOTICE '✅ Added notified column';
  ELSE
    RAISE NOTICE '✅ notified column already exists';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' 
    AND column_name = 'notified_at'
  ) THEN
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN notified_at TIMESTAMP WITH TIME ZONE;
    
    RAISE NOTICE '✅ Added notified_at column';
  ELSE
    RAISE NOTICE '✅ notified_at column already exists';
  END IF;
END $$;

-- STEP 3: Create retry support functions
-- Note: CREATE OR REPLACE is idempotent, so we don't need IF NOT EXISTS

-- Function to get failed events for retry
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

GRANT EXECUTE ON FUNCTION get_failed_events_for_retry TO service_role;

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

GRANT EXECUTE ON FUNCTION mark_error_resolved TO service_role;

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

GRANT EXECUTE ON FUNCTION increment_retry_count TO service_role;

-- STEP 4: Verify everything was created
SELECT 
  '=== VERIFICATION ===' as section;

SELECT 
  'edge_function_errors table' as component,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'edge_function_errors')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
UNION ALL
SELECT 
  'notified column',
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proactive_vehicle_events' AND column_name = 'notified')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END
UNION ALL
SELECT 
  'notified_at column',
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proactive_vehicle_events' AND column_name = 'notified_at')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END
UNION ALL
SELECT 
  'get_failed_events_for_retry function',
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_failed_events_for_retry')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END
UNION ALL
SELECT 
  'mark_error_resolved function',
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'mark_error_resolved')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END
UNION ALL
SELECT 
  'increment_retry_count function',
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'increment_retry_count')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END;
