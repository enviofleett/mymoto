CREATE TABLE IF NOT EXISTS public.email_sender_names (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT email_sender_names_name_length CHECK (char_length(name) <= 50),
    CONSTRAINT email_sender_names_name_format CHECK (name ~ '^[A-Za-z0-9 .-]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_sender_names_name
ON public.email_sender_names (lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_sender_names_default_true
ON public.email_sender_names (is_default)
WHERE is_default = true;

ALTER TABLE public.email_sender_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage email sender names" ON public.email_sender_names;
CREATE POLICY "Admins manage email sender names"
ON public.email_sender_names
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can read active sender names" ON public.email_sender_names;
CREATE POLICY "Anyone can read active sender names"
ON public.email_sender_names
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE OR REPLACE FUNCTION public.update_email_sender_names_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_email_sender_names_updated_at ON public.email_sender_names;
CREATE TRIGGER update_email_sender_names_updated_at
BEFORE UPDATE ON public.email_sender_names
FOR EACH ROW
EXECUTE FUNCTION public.update_email_sender_names_updated_at();
