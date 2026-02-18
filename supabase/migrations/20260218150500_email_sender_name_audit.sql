CREATE TABLE IF NOT EXISTS public.email_sender_name_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_name_id UUID REFERENCES public.email_sender_names(id) ON DELETE SET NULL,
    previous_name TEXT,
    new_name TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_sender_name_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view sender name audit" ON public.email_sender_name_audit;
CREATE POLICY "Admins view sender name audit"
ON public.email_sender_name_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "System inserts sender name audit" ON public.email_sender_name_audit;
CREATE POLICY "System inserts sender name audit"
ON public.email_sender_name_audit
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

