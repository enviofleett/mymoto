
-- Add avatar_url to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS 'URL to user avatar image';

-- Ensure avatars bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload their own avatar
-- Note: We use a folder structure avatars/profiles/USER_ID/filename
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( 
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = 'profiles' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING ( 
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = 'profiles' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow public read access to avatars
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'avatars' );
