-- Support Agent System (tickets, knowledge, queues, representatives)

-- 1) Core tables
CREATE TABLE IF NOT EXISTS public.support_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  routing_instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_representatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES public.support_queues(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role_label TEXT,
  signature TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','open','pending_support','pending_user','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  queue_id UUID REFERENCES public.support_queues(id) ON DELETE SET NULL,
  representative_id UUID REFERENCES public.support_representatives(id) ON DELETE SET NULL,
  subject TEXT,
  summary TEXT,
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user','agent','admin')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user','agent','admin','system')),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  representative_id UUID REFERENCES public.support_representatives(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  message_format TEXT NOT NULL DEFAULT 'plain',
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES public.support_queues(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Useful indexes
CREATE INDEX IF NOT EXISTS idx_support_queues_active ON public.support_queues(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_support_reps_queue_active ON public.support_representatives(queue_id, is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_queue ON public.support_tickets(queue_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON public.support_ticket_messages(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_knowledge_active_queue ON public.support_knowledge_entries(is_active, queue_id);
CREATE INDEX IF NOT EXISTS idx_support_knowledge_tags ON public.support_knowledge_entries USING GIN(tags);

-- 3) updated_at triggers
DROP TRIGGER IF EXISTS update_support_queues_updated_at ON public.support_queues;
CREATE TRIGGER update_support_queues_updated_at
BEFORE UPDATE ON public.support_queues
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();

DROP TRIGGER IF EXISTS update_support_representatives_updated_at ON public.support_representatives;
CREATE TRIGGER update_support_representatives_updated_at
BEFORE UPDATE ON public.support_representatives
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();

DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER update_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();

DROP TRIGGER IF EXISTS update_support_knowledge_entries_updated_at ON public.support_knowledge_entries;
CREATE TRIGGER update_support_knowledge_entries_updated_at
BEFORE UPDATE ON public.support_knowledge_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();

-- 4) RLS
ALTER TABLE public.support_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_knowledge_entries ENABLE ROW LEVEL SECURITY;

-- support_queues
DROP POLICY IF EXISTS "Anyone can read active support queues" ON public.support_queues;
CREATE POLICY "Anyone can read active support queues"
ON public.support_queues
FOR SELECT
USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage support queues" ON public.support_queues;
CREATE POLICY "Admins can manage support queues"
ON public.support_queues
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- support_representatives
DROP POLICY IF EXISTS "Anyone can read active support reps" ON public.support_representatives;
CREATE POLICY "Anyone can read active support reps"
ON public.support_representatives
FOR SELECT
USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage support reps" ON public.support_representatives;
CREATE POLICY "Admins can manage support reps"
ON public.support_representatives
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- support_knowledge_entries
DROP POLICY IF EXISTS "Anyone can read active support knowledge" ON public.support_knowledge_entries;
CREATE POLICY "Anyone can read active support knowledge"
ON public.support_knowledge_entries
FOR SELECT
USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage support knowledge" ON public.support_knowledge_entries;
CREATE POLICY "Admins can manage support knowledge"
ON public.support_knowledge_entries
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- support_tickets
DROP POLICY IF EXISTS "Users can read own support tickets" ON public.support_tickets;
CREATE POLICY "Users can read own support tickets"
ON public.support_tickets
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Users can create own support tickets" ON public.support_tickets;
CREATE POLICY "Users can create own support tickets"
ON public.support_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Users can update own support tickets" ON public.support_tickets;
CREATE POLICY "Users can update own support tickets"
ON public.support_tickets
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- support_ticket_messages
DROP POLICY IF EXISTS "Users can read messages for own tickets" ON public.support_ticket_messages;
CREATE POLICY "Users can read messages for own tickets"
ON public.support_ticket_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Users can create messages for own tickets" ON public.support_ticket_messages;
CREATE POLICY "Users can create messages for own tickets"
ON public.support_ticket_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Admins can update/delete support messages" ON public.support_ticket_messages;
CREATE POLICY "Admins can update/delete support messages"
ON public.support_ticket_messages
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5) Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 6) Hybrid knowledge search RPC
CREATE OR REPLACE FUNCTION public.search_support_knowledge(
  p_query TEXT,
  p_queue_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  source_type TEXT,
  source_id UUID,
  title TEXT,
  snippet TEXT,
  score REAL,
  queue_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH manual_docs AS (
    SELECT
      'manual'::text AS source_type,
      k.id AS source_id,
      k.title,
      LEFT(k.content, 320) AS snippet,
      (
        CASE WHEN k.title ILIKE ('%' || p_query || '%') THEN 4 ELSE 0 END +
        CASE WHEN k.content ILIKE ('%' || p_query || '%') THEN 3 ELSE 0 END +
        CASE WHEN EXISTS (
          SELECT 1 FROM unnest(k.tags) tag WHERE tag ILIKE ('%' || p_query || '%')
        ) THEN 2 ELSE 0 END
      )::real AS score,
      k.queue_id
    FROM public.support_knowledge_entries k
    WHERE k.is_active = true
      AND (p_queue_id IS NULL OR k.queue_id = p_queue_id OR k.queue_id IS NULL)
      AND (
        k.title ILIKE ('%' || p_query || '%')
        OR k.content ILIKE ('%' || p_query || '%')
        OR EXISTS (SELECT 1 FROM unnest(k.tags) tag WHERE tag ILIKE ('%' || p_query || '%'))
      )
  ),
  resource_docs AS (
    SELECT
      'resource_post'::text AS source_type,
      p.id AS source_id,
      p.title,
      LEFT(regexp_replace(p.content, '<[^>]+>', '', 'g'), 320) AS snippet,
      (
        CASE WHEN p.title ILIKE ('%' || p_query || '%') THEN 3 ELSE 0 END +
        CASE WHEN p.content ILIKE ('%' || p_query || '%') THEN 2 ELSE 0 END
      )::real AS score,
      NULL::uuid AS queue_id
    FROM public.resource_posts p
    WHERE p.is_published = true
      AND (
        p.title ILIKE ('%' || p_query || '%')
        OR p.content ILIKE ('%' || p_query || '%')
      )
  ),
  combined AS (
    SELECT * FROM manual_docs
    UNION ALL
    SELECT * FROM resource_docs
  )
  SELECT c.source_type, c.source_id, c.title, c.snippet, c.score, c.queue_id
  FROM combined c
  ORDER BY c.score DESC, c.title ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20));
$$;

GRANT EXECUTE ON FUNCTION public.search_support_knowledge(TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_support_knowledge(TEXT, UUID, INTEGER) TO service_role;

-- 7) Seed defaults
INSERT INTO public.support_queues (name, slug, description, routing_instructions, display_order)
VALUES
  ('Technical Support', 'technical', 'Troubleshooting tracking, GPS, and device behavior.', 'Prioritize root-cause diagnosis for GPS/device issues and provide concise remediation steps.', 10),
  ('Sales Support', 'sales', 'Pricing, plans, upgrades, and onboarding guidance.', 'Focus on plans, value, and clear next actions for conversion.', 20),
  ('General Support', 'general', 'General help and account questions.', 'Handle general account, app usage, and escalation guidance.', 30)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.app_settings (key, value, metadata)
VALUES
  ('support_agent_system_prompt', 'You are MyMoto Support Agent. Be concise, accurate, empathetic, and action-oriented. Focus on technical tracking issues, sales support, and queue-specific guidance.', '{"description":"Global system prompt for support agent"}'::jsonb),
  ('support_agent_model', '', '{"description":"Optional model override for support agent (falls back to LLM_MODEL env)"}'::jsonb),
  ('support_agent_max_context_docs', '5', '{"description":"Maximum number of context docs fetched for support answers"}'::jsonb),
  ('support_agent_handoff_rules', '{"handoff_on":["billing_dispute","payment_failure","device_offline_over_24h"]}', '{"description":"Rules for when to suggest human handoff"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
