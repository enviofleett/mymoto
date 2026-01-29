-- Migration: Allow multiple users per vehicle
-- Changes vehicle_assignments from single-user (device_id PRIMARY KEY) to many-to-many (device_id, profile_id PRIMARY KEY)

-- Step 0: Drop all policies that depend on vehicle_assignments
DROP POLICY IF EXISTS "Users can view their vehicle patterns" ON public.trip_patterns;
DROP POLICY IF EXISTS "Users view relevant rules" ON public.alert_rules;
DROP POLICY IF EXISTS "Users view own dispatches" ON public.alert_dispatch_log;
DROP POLICY IF EXISTS "Assigned owners can insert llm settings" ON public.vehicle_llm_settings;
DROP POLICY IF EXISTS "Assigned owners can update llm settings" ON public.vehicle_llm_settings;
DROP POLICY IF EXISTS "Assigned owners can delete llm settings" ON public.vehicle_llm_settings;
DROP POLICY IF EXISTS "Users can view their vehicle events" ON public.proactive_vehicle_events;
DROP POLICY IF EXISTS "Users can acknowledge their vehicle events" ON public.proactive_vehicle_events;
DROP POLICY IF EXISTS "Authenticated users can read ACC state history" ON public.acc_state_history;

-- Conditionally drop other dependent policies (tables might not exist yet in a fresh run)
DO $$
BEGIN
    -- vehicle_trips
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vehicle_trips') THEN
        DROP POLICY IF EXISTS "Users can view vehicle trips for assigned vehicles" ON public.vehicle_trips;
    END IF;

    -- trip_sync_status
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trip_sync_status') THEN
        DROP POLICY IF EXISTS "Users can view trip sync status for assigned vehicles" ON public.trip_sync_status;
    END IF;
    
    -- vehicle_specifications
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vehicle_specifications') THEN
        DROP POLICY IF EXISTS "Users can view their vehicle specifications" ON public.vehicle_specifications;
        DROP POLICY IF EXISTS "Users can manage their vehicle specifications" ON public.vehicle_specifications;
    END IF;
END $$;

-- Step 1: Create new table with composite primary key
CREATE TABLE public.vehicle_assignments_new (
    device_id TEXT NOT NULL,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    vehicle_alias TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (device_id, profile_id)
);

-- Step 2: Copy existing data (keep only one assignment per vehicle for now)
INSERT INTO public.vehicle_assignments_new (device_id, profile_id, vehicle_alias, created_at, updated_at)
SELECT device_id, profile_id, vehicle_alias, created_at, updated_at
FROM public.vehicle_assignments
WHERE profile_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 3: Drop old table
DROP TABLE public.vehicle_assignments;

-- Step 4: Rename new table
ALTER TABLE public.vehicle_assignments_new RENAME TO vehicle_assignments;

-- Step 5: Recreate indexes
CREATE INDEX idx_vehicle_assignments_device_id ON public.vehicle_assignments(device_id);
CREATE INDEX idx_vehicle_assignments_profile_id ON public.vehicle_assignments(profile_id);

-- Step 6: Re-enable RLS
ALTER TABLE public.vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- Step 7: Recreate RLS policies
CREATE POLICY "Authenticated users can read assignments" 
ON public.vehicle_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert assignments" 
ON public.vehicle_assignments FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update assignments" 
ON public.vehicle_assignments FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete assignments" 
ON public.vehicle_assignments FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- Step 8: Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_vehicle_assignments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $trigger$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$trigger$;

-- Step 9: Create trigger to handle updated_at
DROP TRIGGER IF EXISTS update_vehicle_assignments_updated_at ON public.vehicle_assignments;
CREATE TRIGGER update_vehicle_assignments_updated_at
BEFORE UPDATE ON public.vehicle_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_vehicle_assignments_updated_at();

-- Step 10: Recreate policies that depend on vehicle_assignments
-- Trip patterns policy
CREATE POLICY "Users can view their vehicle patterns"
ON public.trip_patterns FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM vehicle_assignments va
        JOIN profiles p ON p.id = va.profile_id
        WHERE va.device_id = trip_patterns.device_id
        AND p.user_id = auth.uid()
    )
);

-- Alert rules policy
CREATE POLICY "Users view relevant rules"
ON alert_rules FOR SELECT
USING (
    target_type = 'fleet' 
    OR (target_type = 'user' AND target_id = auth.uid()::text)
    OR (target_type = 'vehicle' AND EXISTS (
        SELECT 1 FROM vehicle_assignments va
        JOIN profiles p ON p.id = va.profile_id
        WHERE device_id = alert_rules.target_id 
        AND p.user_id = auth.uid()
    ))
);

-- Alert dispatch log policy
CREATE POLICY "Users view own dispatches"
ON alert_dispatch_log FOR SELECT
USING (
    has_role(auth.uid(), 'admin')
    OR EXISTS (
        SELECT 1 FROM proactive_vehicle_events pve
        JOIN vehicle_assignments va ON va.device_id = pve.device_id
        JOIN profiles p ON p.id = va.profile_id
        WHERE pve.id = alert_dispatch_log.event_id
        AND p.user_id = auth.uid()
    )
);

-- Vehicle LLM settings policies
CREATE POLICY "Assigned owners can insert llm settings"
ON vehicle_llm_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = vehicle_llm_settings.device_id 
    AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Assigned owners can update llm settings"
ON vehicle_llm_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = vehicle_llm_settings.device_id 
    AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Assigned owners can delete llm settings"
ON vehicle_llm_settings
FOR DELETE
USING (
  EXISTS (
    SELECT 1 
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = vehicle_llm_settings.device_id 
    AND p.user_id = auth.uid()
  )
);

-- Proactive vehicle events policies
CREATE POLICY "Users can view their vehicle events"
ON public.proactive_vehicle_events
FOR SELECT
USING (
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

CREATE POLICY "Users can acknowledge their vehicle events"
ON public.proactive_vehicle_events
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR
  EXISTS (
    SELECT 1
    FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = proactive_vehicle_events.device_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
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

-- ACC state history policy
CREATE POLICY "Authenticated users can read ACC state history"
  ON public.acc_state_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicle_assignments va
      JOIN profiles p ON p.id = va.profile_id
      WHERE va.device_id = acc_state_history.device_id
      AND p.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
