-- Allow authenticated users to upload their own profile avatar
DROP POLICY IF EXISTS "Users can upload their own profile avatar" ON storage.objects;
CREATE POLICY "Users can upload their own profile avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to update their own profile avatar
DROP POLICY IF EXISTS "Users can update their own profile avatar" ON storage.objects;
CREATE POLICY "Users can update their own profile avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to delete their own profile avatar
DROP POLICY IF EXISTS "Users can delete their own profile avatar" ON storage.objects;
CREATE POLICY "Users can delete their own profile avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
