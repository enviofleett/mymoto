-- Billing Config Audit Log
CREATE TABLE IF NOT EXISTS public.billing_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  old_value DECIMAL(12,2),
  new_value DECIMAL(12,2),
  updated_by UUID,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.billing_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read billing config audit"
ON public.billing_config_audit FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages billing config audit"
ON public.billing_config_audit FOR ALL
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.billing_config_audit IS 'Audit trail for billing_config changes';
