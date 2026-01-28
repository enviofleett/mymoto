-- Secure vehicles table by revoking public access
-- This ensures anonymous users cannot query the vehicles table at all
-- regardless of RLS policies.

REVOKE ALL ON public.vehicles FROM anon;
REVOKE ALL ON public.vehicles FROM public;

-- Ensure authenticated users still have access (RLS will filter rows)
GRANT SELECT ON public.vehicles TO authenticated;
GRANT UPDATE ON public.vehicles TO authenticated; -- Needed for owners to update settings if logic requires it (RLS restricts which rows)

-- Also secure related sensitive tables just in case
REVOKE ALL ON public.vehicle_positions FROM anon;
REVOKE ALL ON public.vehicle_positions FROM public;
GRANT SELECT ON public.vehicle_positions TO authenticated;

REVOKE ALL ON public.position_history FROM anon;
REVOKE ALL ON public.position_history FROM public;
GRANT SELECT ON public.position_history TO authenticated;

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_history ENABLE ROW LEVEL SECURITY;
