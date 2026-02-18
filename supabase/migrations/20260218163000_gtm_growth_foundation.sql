-- GTM Growth Foundation: analytics, attribution, experiments, and referral scaffolding.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  attribution JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name_created_at
  ON public.analytics_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id_created_at
  ON public.analytics_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_attribution (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_touch JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_touch JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.growth_experiments(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NULL,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT experiment_assignment_identity_ck CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_user_id
  ON public.experiment_assignments(user_id);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_experiment_id
  ON public.experiment_assignments(experiment_id);

CREATE TABLE IF NOT EXISTS public.referral_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  channel TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID NOT NULL REFERENCES public.referral_invites(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  converted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_conversion_unique UNIQUE (invite_id, invited_user_id)
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Analytics insert for anon and authenticated" ON public.analytics_events;
CREATE POLICY "Analytics insert for anon and authenticated"
ON public.analytics_events FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can read their analytics events" ON public.analytics_events;
CREATE POLICY "Users can read their analytics events"
ON public.analytics_events FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all analytics events" ON public.analytics_events;
CREATE POLICY "Admins can read all analytics events"
ON public.analytics_events FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Users manage own attribution" ON public.user_attribution;
CREATE POLICY "Users manage own attribution"
ON public.user_attribution FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own experiment assignments" ON public.experiment_assignments;
CREATE POLICY "Users read own experiment assignments"
ON public.experiment_assignments FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own referrals" ON public.referral_invites;
CREATE POLICY "Users read own referrals"
ON public.referral_invites FOR SELECT
TO authenticated
USING (auth.uid() = inviter_user_id);

DROP POLICY IF EXISTS "Users create own referrals" ON public.referral_invites;
CREATE POLICY "Users create own referrals"
ON public.referral_invites FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = inviter_user_id);

DROP POLICY IF EXISTS "Users read own referral conversions" ON public.referral_conversions;
CREATE POLICY "Users read own referral conversions"
ON public.referral_conversions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.referral_invites ri
    WHERE ri.id = referral_conversions.invite_id
      AND ri.inviter_user_id = auth.uid()
  )
  OR auth.uid() = invited_user_id
);

DROP POLICY IF EXISTS "Service role full access analytics_events" ON public.analytics_events;
CREATE POLICY "Service role full access analytics_events"
ON public.analytics_events FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access user_attribution" ON public.user_attribution;
CREATE POLICY "Service role full access user_attribution"
ON public.user_attribution FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access growth_experiments" ON public.growth_experiments;
CREATE POLICY "Service role full access growth_experiments"
ON public.growth_experiments FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access experiment_assignments" ON public.experiment_assignments;
CREATE POLICY "Service role full access experiment_assignments"
ON public.experiment_assignments FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access referral_invites" ON public.referral_invites;
CREATE POLICY "Service role full access referral_invites"
ON public.referral_invites FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access referral_conversions" ON public.referral_conversions;
CREATE POLICY "Service role full access referral_conversions"
ON public.referral_conversions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_user_attribution_touch_updated_at ON public.user_attribution;
CREATE TRIGGER tr_user_attribution_touch_updated_at
BEFORE UPDATE ON public.user_attribution
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS tr_growth_experiments_touch_updated_at ON public.growth_experiments;
CREATE TRIGGER tr_growth_experiments_touch_updated_at
BEFORE UPDATE ON public.growth_experiments
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();
