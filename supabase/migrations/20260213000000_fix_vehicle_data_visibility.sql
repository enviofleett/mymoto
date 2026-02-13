-- Fix vehicle data visibility for admins and assigned users
--
-- BUG 2: vehicle_positions RLS was USING (true), leaking all GPS data to all users
-- BUG 3: vehicle_chat_history RLS compared va.profile_id = auth.uid() instead of
--         joining through profiles table (profile_id != auth user_id)

-- ============================================================================
-- 1. Fix vehicle_positions RLS: restrict to assigned vehicles + admins
-- ============================================================================

ALTER TABLE public.vehicle_positions ENABLE ROW LEVEL SECURITY;

-- Drop the overly-permissive policy
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.vehicle_positions;
DROP POLICY IF EXISTS "Authenticated users can read positions" ON public.vehicle_positions;
DROP POLICY IF EXISTS "Service role can manage positions" ON public.vehicle_positions;

-- Create proper access-controlled policy
CREATE POLICY "Users can view positions for assigned vehicles, admins see all"
ON public.vehicle_positions FOR SELECT
TO authenticated
USING (
  -- Admins can see all vehicle positions
  public.has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Users can see positions for vehicles assigned to them
  EXISTS (
    SELECT 1
    FROM public.vehicle_assignments va
    JOIN public.profiles p ON p.id = va.profile_id
    WHERE va.device_id = vehicle_positions.device_id
      AND p.user_id = auth.uid()
  )
);

-- Service role needs full access for edge functions (gps-data sync)
CREATE POLICY "Service role can manage all positions"
ON public.vehicle_positions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Ensure grants are correct
REVOKE ALL ON public.vehicle_positions FROM anon;
REVOKE ALL ON public.vehicle_positions FROM public;
GRANT SELECT ON public.vehicle_positions TO authenticated;
GRANT ALL ON public.vehicle_positions TO service_role;

-- ============================================================================
-- 2. Fix vehicle_chat_history RLS: use proper join through profiles
-- ============================================================================

-- Drop the broken policy that compared profile_id to auth.uid()
DROP POLICY IF EXISTS "Users can view their own chat history" ON public.vehicle_chat_history;

-- Recreate with correct join through profiles table
CREATE POLICY "Users can view their own chat history"
ON public.vehicle_chat_history FOR SELECT
USING (
    auth.uid() = user_id
    OR
    EXISTS (
        SELECT 1 FROM public.vehicle_assignments va
        JOIN public.profiles p ON p.id = va.profile_id
        WHERE va.device_id = vehicle_chat_history.device_id
          AND p.user_id = auth.uid()
    )
);
