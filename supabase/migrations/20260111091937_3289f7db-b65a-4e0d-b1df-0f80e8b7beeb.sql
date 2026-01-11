-- Fix overly permissive RLS policies for llm_analytics and alert_dispatch_log

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Service role inserts analytics" ON llm_analytics;
DROP POLICY IF EXISTS "Service role manages dispatches" ON alert_dispatch_log;

-- Create proper policies that check for authenticated users or service role context
CREATE POLICY "Authenticated users insert own analytics"
ON llm_analytics FOR INSERT
WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);

CREATE POLICY "System inserts dispatch logs"
ON alert_dispatch_log FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL OR EXISTS (
    SELECT 1 FROM proactive_vehicle_events WHERE id = event_id
));

CREATE POLICY "System updates dispatch logs"
ON alert_dispatch_log FOR UPDATE
USING (auth.uid() IS NOT NULL OR has_role(auth.uid(), 'admin'));