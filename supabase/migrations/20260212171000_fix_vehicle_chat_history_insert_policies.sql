-- Fix: vehicle_chat_history INSERT policy drift
-- Keep only the strict insert rule (admin OR assigned vehicle) and drop permissive duplicates.

ALTER TABLE public.vehicle_chat_history ENABLE ROW LEVEL SECURITY;

-- Drop permissive/duplicate INSERT policies (policies are OR'd; leaving these weakens strict RLS).
DROP POLICY IF EXISTS "Users can insert messages" ON public.vehicle_chat_history;
DROP POLICY IF EXISTS "Users can insert their own chat messages" ON public.vehicle_chat_history;

-- Recreate strict INSERT policy deterministically (idempotent).
DROP POLICY IF EXISTS "Users can insert own vehicle_chat_history" ON public.vehicle_chat_history;
CREATE POLICY "Users can insert own vehicle_chat_history"
ON public.vehicle_chat_history
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.vehicle_assignments va
      JOIN public.profiles p ON p.id = va.profile_id
      WHERE va.device_id = vehicle_chat_history.device_id
        AND p.user_id = auth.uid()
    )
  )
);
