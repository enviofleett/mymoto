-- Phase 1: Remove duplicate RSH128EA vehicle (typo device_id)
-- The correct device is 1361282381, the duplicate 13612332381 has only 43 stale records

-- Remove assignment for duplicate
DELETE FROM vehicle_assignments WHERE device_id = '13612332381';

-- Remove any position history for duplicate
DELETE FROM position_history WHERE device_id = '13612332381';

-- Remove any vehicle trips for duplicate
DELETE FROM vehicle_trips WHERE device_id = '13612332381';

-- Remove the duplicate vehicle entry
DELETE FROM vehicles WHERE device_id = '13612332381';

-- Phase 2: Ensure avatars bucket has proper RLS policies
-- Check if policies exist and create if needed

-- Policy: Anyone can view avatars (public bucket)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Public can view avatars'
    ) THEN
        CREATE POLICY "Public can view avatars"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'avatars');
    END IF;
END $$;

-- Policy: Authenticated users can upload avatars
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Authenticated users can upload avatars'
    ) THEN
        CREATE POLICY "Authenticated users can upload avatars"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'avatars' 
            AND (storage.foldername(name))[1] = 'vehicle-avatars'
            AND octet_length(name) < 2097152  -- 2MB limit
        );
    END IF;
END $$;

-- Policy: Authenticated users can update their uploads
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Users can update avatars'
    ) THEN
        CREATE POLICY "Users can update avatars"
        ON storage.objects FOR UPDATE
        TO authenticated
        USING (bucket_id = 'avatars')
        WITH CHECK (bucket_id = 'avatars');
    END IF;
END $$;

-- Policy: Admins can delete avatars
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Admins can delete avatars'
    ) THEN
        CREATE POLICY "Admins can delete avatars"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (bucket_id = 'avatars' AND has_role(auth.uid(), 'admin'));
    END IF;
END $$;