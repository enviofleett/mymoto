-- Ensure authenticated users can read gps51_sync_status for their assigned vehicles.
-- Without this, RLS (enabled) will silently return 0 rows, making the UI show status "undefined".

ALTER TABLE public.gps51_sync_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins or assigned users can read gps51_sync_status" ON public.gps51_sync_status;
CREATE POLICY "Admins or assigned users can read gps51_sync_status"
  ON public.gps51_sync_status
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.vehicle_assignments va
      JOIN public.profiles p ON p.id = va.profile_id
      WHERE va.device_id = gps51_sync_status.device_id
        AND p.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.gps51_sync_status TO authenticated;
