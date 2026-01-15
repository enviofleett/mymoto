-- Fix RLS policies for proactive_vehicle_events to filter by user vehicle assignments
-- CRITICAL SECURITY FIX: Users should only see alarms for their assigned vehicles

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can read events" ON public.proactive_vehicle_events;
DROP POLICY IF EXISTS "Authenticated users can view events" ON public.proactive_vehicle_events;

-- Drop existing policies if they exist (in case migration was partially run)
DROP POLICY IF EXISTS "Users can view their vehicle events" ON public.proactive_vehicle_events;
DROP POLICY IF EXISTS "Users can acknowledge their vehicle events" ON public.proactive_vehicle_events;

-- Create new policy: Users can only see events for their assigned vehicles
CREATE POLICY "Users can view their vehicle events"
ON public.proactive_vehicle_events
FOR SELECT
USING (
  -- Admins can see all events
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Regular users can only see events for vehicles assigned to them
  EXISTS (
    SELECT 1
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = proactive_vehicle_events.device_id
      AND p.user_id = auth.uid()
  )
);

-- Users can acknowledge events for their vehicles
CREATE POLICY "Users can acknowledge their vehicle events"
ON public.proactive_vehicle_events
FOR UPDATE
USING (
  -- Admins can acknowledge any event
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Regular users can acknowledge events for their vehicles
  EXISTS (
    SELECT 1
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = proactive_vehicle_events.device_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  -- Same check for updates
  has_role(auth.uid(), 'admin'::app_role)
  OR
  EXISTS (
    SELECT 1
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = proactive_vehicle_events.device_id
      AND p.user_id = auth.uid()
  )
);

COMMENT ON POLICY "Users can view their vehicle events" ON public.proactive_vehicle_events IS 
'Users can only see proactive events for vehicles assigned to them. Admins can see all events.';

COMMENT ON POLICY "Users can acknowledge their vehicle events" ON public.proactive_vehicle_events IS 
'Users can acknowledge events for their assigned vehicles. Admins can acknowledge any event.';
