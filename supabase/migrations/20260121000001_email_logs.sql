-- Email logs for tracking and rate limiting
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'rate_limited', 'validation_failed')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  user_id UUID REFERENCES auth.users(id),
  sender_id TEXT
);

-- Indexes for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_email_logs_user_time ON public.email_logs(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON public.email_logs(sent_at DESC);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all logs
DROP POLICY IF EXISTS "Admins can view email logs" ON public.email_logs;
CREATE POLICY "Admins can view email logs"
ON public.email_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policy: System can insert logs (via service role)
DROP POLICY IF EXISTS "System can insert email logs" ON public.email_logs;
CREATE POLICY "System can insert email logs"
ON public.email_logs FOR INSERT
WITH CHECK (true); -- Service role bypasses RLS

COMMENT ON TABLE public.email_logs IS 'Logs all email sending attempts for rate limiting and monitoring';
COMMENT ON COLUMN public.email_logs.status IS 'Status: sent, failed, rate_limited, or validation_failed';
