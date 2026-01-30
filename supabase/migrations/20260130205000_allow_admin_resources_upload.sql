-- Allow admins to upload/manage resource images in the 'avatars' bucket under 'resources/' folder

-- Policy: Admins can upload resources
CREATE POLICY "Admins can upload resources"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = 'resources'
  AND public.has_role(auth.uid(), 'admin')
);

-- Policy: Admins can update resources
CREATE POLICY "Admins can update resources"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = 'resources'
  AND public.has_role(auth.uid(), 'admin')
);

-- Policy: Admins can delete resources
CREATE POLICY "Admins can delete resources"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = 'resources'
  AND public.has_role(auth.uid(), 'admin')
);

-- Ensure public read access for resources (if not already covered globally)
-- Note: "Anyone can view avatars" policy usually covers the whole bucket, but we add this just in case specific folder restrictions are applied later.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Public can view resources'
    ) THEN
        CREATE POLICY "Public can view resources"
        ON storage.objects FOR SELECT
        TO public
        USING (
            bucket_id = 'avatars' 
            AND (storage.foldername(name))[1] = 'resources'
        );
    END IF;
END $$;
