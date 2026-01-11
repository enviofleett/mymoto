-- STEP 1: Add RLS policy allowing assigned vehicle owners to manage LLM settings
-- This fixes the "permission denied" error when owners try to save persona settings

-- Policy: Assigned owners can INSERT their vehicle's LLM settings
CREATE POLICY "Assigned owners can insert llm settings"
ON vehicle_llm_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM vehicle_assignments va
    WHERE va.device_id = vehicle_llm_settings.device_id
    AND va.profile_id = auth.uid()
  )
);

-- Policy: Assigned owners can UPDATE their vehicle's LLM settings
CREATE POLICY "Assigned owners can update llm settings"
ON vehicle_llm_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM vehicle_assignments va
    WHERE va.device_id = vehicle_llm_settings.device_id
    AND va.profile_id = auth.uid()
  )
);

-- Policy: Assigned owners can DELETE their vehicle's LLM settings
CREATE POLICY "Assigned owners can delete llm settings"
ON vehicle_llm_settings
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM vehicle_assignments va
    WHERE va.device_id = vehicle_llm_settings.device_id
    AND va.profile_id = auth.uid()
  )
);