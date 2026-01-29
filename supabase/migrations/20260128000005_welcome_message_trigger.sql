
-- Enable pg_net extension if not already enabled (requires superuser, usually enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- Function to handle new vehicle welcome message
CREATE OR REPLACE FUNCTION handle_new_vehicle_welcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Try to get settings from app.settings (custom) or vault
  -- Fallback to hardcoded empty string if not found (trigger will fail gracefully)
  BEGIN
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.supabase_service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    supabase_url := NULL;
    service_role_key := NULL;
  END;

  -- If settings are missing, we can try to infer them or skip
  -- For now, we assume they are set. If not, we can't make the call.
  -- ALTERNATIVE: Use vault.secrets if available, but that's complex to script.
  
  -- NOTE: In a real Supabase environment, you should configure these settings 
  -- via `ALTER DATABASE postgres SET "app.settings.supabase_url" = '...';`
  
  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    -- Try to fetch from vault if available (optional)
    -- RAISE WARNING 'Supabase URL/Key not set in app.settings';
    RETURN NEW; 
  END IF;

  -- Call the Edge Function
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/welcome-new-vehicle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'record', row_to_json(NEW)
    )
  );

  RETURN NEW;
END;
$$;

-- Create Trigger
DROP TRIGGER IF EXISTS on_vehicle_created_welcome ON public.vehicles;
CREATE TRIGGER on_vehicle_created_welcome
AFTER INSERT ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION handle_new_vehicle_welcome();

-- Insert default template if not exists
INSERT INTO app_settings (key, value, metadata)
VALUES (
  'welcome_message_template',
  'Welcome to your new {{vehicle_name}}! 🚗\nI am your AI companion, connected directly to this vehicle''s systems.\nI can help you track trips, monitor health, and ensure security.\nFeel free to ask me anything about your car!',
  '{"description": "Default welcome message template", "updated_by": "system"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
