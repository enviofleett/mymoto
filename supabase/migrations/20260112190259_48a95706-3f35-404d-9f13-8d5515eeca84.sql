-- Table to store admin-configurable popup content for /app page
CREATE TABLE IF NOT EXISTS app_popup_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled BOOLEAN DEFAULT true NOT NULL,
  title TEXT NOT NULL DEFAULT 'Welcome to MyMoto!',
  message TEXT NOT NULL DEFAULT 'Install our app for the best experience.',
  button_text TEXT DEFAULT 'Got it!',
  show_for_ios BOOLEAN DEFAULT true NOT NULL,
  show_for_android BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Insert default config row
INSERT INTO app_popup_config (title, message, button_text)
VALUES (
  '🚗 Welcome to MyMoto!',
  'Track your vehicle, chat with your car, and manage your fleet - all from your pocket. Install the app for instant access!',
  'Let''s Go!'
);

-- Enable RLS
ALTER TABLE app_popup_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read (for the popup to display)
CREATE POLICY "Anyone can read app popup config"
  ON app_popup_config FOR SELECT
  USING (true);

-- Only authenticated users can update (admin check done in app)
CREATE POLICY "Authenticated users can update app popup config"
  ON app_popup_config FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Authenticated users can insert (in case row is deleted)
CREATE POLICY "Authenticated users can insert app popup config"
  ON app_popup_config FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);