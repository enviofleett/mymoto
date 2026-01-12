# PWA Update System - Setup Instructions

## Database Table Required

Run this SQL in your Supabase SQL Editor to enable the PWA update system:

```sql
-- Create table for PWA update management
CREATE TABLE IF NOT EXISTS public.app_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  release_notes text,
  is_mandatory boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.app_updates ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read updates
CREATE POLICY "Anyone can read app updates"
  ON public.app_updates
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins to insert updates
CREATE POLICY "Admins can insert app updates"
  ON public.app_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update records
CREATE POLICY "Admins can update app updates"
  ON public.app_updates
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for instant update notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_updates;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_updates_active 
  ON public.app_updates(is_active) 
  WHERE is_active = true;
```

## How It Works

1. **Admin Dashboard**: Admins see a "Push PWA Update" card on the Index page
2. **Version Management**: Enter version number (auto-incremented), release notes, and mandatory flag
3. **Realtime Push**: When an update is pushed, all connected PWA users receive it instantly
4. **User Prompt**: Users see an update prompt at the bottom of their screen
5. **Apply Update**: Clicking "Update Now" clears caches and reloads the app
6. **Mandatory Updates**: Users cannot dismiss mandatory updates

## Update Types

- **Regular Update**: Users can dismiss and update later
- **Mandatory Update**: Users must update to continue using the app
