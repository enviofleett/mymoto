-- Fix overly permissive RLS policies
-- The "Service role can manage" policies with USING(true) are redundant because service_role bypasses RLS.
-- These policies create security warnings and should be removed.

-- Drop redundant service role policies (service_role bypasses RLS anyway)
DROP POLICY IF EXISTS "Service role can manage app_settings" ON app_settings;
DROP POLICY IF EXISTS "Service role can manage summaries" ON conversation_summaries;
DROP POLICY IF EXISTS "Service role can manage insights" ON fleet_insights_history;
DROP POLICY IF EXISTS "Service role can manage events" ON geofence_events;
DROP POLICY IF EXISTS "Service role can manage locations" ON geofence_locations;
DROP POLICY IF EXISTS "Service role can manage monitors" ON geofence_monitors;
DROP POLICY IF EXISTS "Service role can manage logs" ON gps_api_logs;
DROP POLICY IF EXISTS "Service role can manage history" ON position_history;
DROP POLICY IF EXISTS "Service role can manage events" ON proactive_vehicle_events;
DROP POLICY IF EXISTS "Service role can manage trip analytics" ON trip_analytics;
DROP POLICY IF EXISTS "Service role can manage chat history" ON vehicle_chat_history;
DROP POLICY IF EXISTS "Service role can manage command logs" ON vehicle_command_logs;
DROP POLICY IF EXISTS "Service role can manage positions" ON vehicle_positions;
DROP POLICY IF EXISTS "Service role can manage trips" ON vehicle_trips;
DROP POLICY IF EXISTS "Service role can manage vehicles" ON vehicles;
DROP POLICY IF EXISTS "Service role can manage transactions" ON wallet_transactions;
DROP POLICY IF EXISTS "Service role can manage wallets" ON wallets;

-- Add proper admin-only INSERT policies where needed for edge functions
-- (Edge functions use service_role key which bypasses RLS, so no policies needed for them)

-- For tables that need admin write access via client, add proper admin policies
CREATE POLICY "Admins can manage app_settings"
ON app_settings FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage fleet insights"
ON fleet_insights_history FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage gps logs"
ON gps_api_logs FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage position history"
ON position_history FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage trip analytics"
ON trip_analytics FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage vehicle positions"
ON vehicle_positions FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage vehicle trips"
ON vehicle_trips FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage vehicles"
ON vehicles FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage wallets"
ON wallets FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage wallet transactions"
ON wallet_transactions FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));