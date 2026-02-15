-- Web Push subscriptions for PWAs (VAPID/Web Push)
-- Stores each device/browser subscription for a user so Edge Functions can send background notifications.

CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,

  user_agent TEXT,
  platform TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_endpoint
ON public.user_push_subscriptions(user_id, endpoint);

CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_id
ON public.user_push_subscriptions(user_id);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Users can manage their own push subscriptions"
ON public.user_push_subscriptions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can read all push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Service role can read all push subscriptions"
ON public.user_push_subscriptions
FOR SELECT
TO service_role
USING (true);

CREATE OR REPLACE FUNCTION public.update_user_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_push_subscriptions_updated_at ON public.user_push_subscriptions;
CREATE TRIGGER update_user_push_subscriptions_updated_at
BEFORE UPDATE ON public.user_push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_user_push_subscriptions_updated_at();

COMMENT ON TABLE public.user_push_subscriptions IS 'Stores Web Push subscriptions for users (PWA background notifications).';

