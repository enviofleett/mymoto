-- Fix RLS policies for vehicle_llm_settings
-- The current policies incorrectly compare profile_id to auth.uid()
-- They should check profiles.user_id = auth.uid() instead

-- Drop existing owner policies
DROP POLICY IF EXISTS "Assigned owners can insert llm settings" ON vehicle_llm_settings;
DROP POLICY IF EXISTS "Assigned owners can update llm settings" ON vehicle_llm_settings;
DROP POLICY IF EXISTS "Assigned owners can delete llm settings" ON vehicle_llm_settings;

-- Recreate with correct user_id check through profiles table
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