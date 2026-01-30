-- Add design_metadata column to email_templates
-- This allows storing structured content (headline, body, layout_id) separately from the generated HTML

ALTER TABLE public.email_templates
ADD COLUMN IF NOT EXISTS design_metadata JSONB DEFAULT '{}'::jsonb;

-- Comment on column
COMMENT ON COLUMN public.email_templates.design_metadata IS 'Stores layout ID and structured content (headline, body, etc.) for the template builder';
