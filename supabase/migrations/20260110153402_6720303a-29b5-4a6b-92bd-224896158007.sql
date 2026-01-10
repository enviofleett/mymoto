-- Create the avatars bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 
  'avatars', 
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- Policy: Anyone can view vehicle avatars (public bucket)
CREATE POLICY "Vehicle avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'vehicle-avatars');

-- Policy: Authenticated users can upload vehicle avatars
CREATE POLICY "Authenticated users can upload vehicle avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = 'vehicle-avatars'
);

-- Policy: Authenticated users can update their uploaded avatars
CREATE POLICY "Authenticated users can update vehicle avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'vehicle-avatars');

-- Policy: Admins can delete any vehicle avatar
CREATE POLICY "Admins can delete vehicle avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = 'vehicle-avatars'
  AND public.has_role(auth.uid(), 'admin')
);