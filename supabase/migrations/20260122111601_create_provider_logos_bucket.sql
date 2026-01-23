-- Create provider-logos storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'provider-logos',
  'provider-logos',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for provider-logos bucket
-- Public read access (for directory display)
CREATE POLICY "Public read access for provider logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'provider-logos');

-- Providers can upload to their own folder
CREATE POLICY "Providers upload own logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'provider-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Providers can update their own logos
CREATE POLICY "Providers update own logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'provider-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Providers can delete their own logos
CREATE POLICY "Providers delete own logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'provider-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins can manage all logos
CREATE POLICY "Admins manage all provider logos"
ON storage.objects FOR ALL
USING (
  bucket_id = 'provider-logos' AND
  public.has_role(auth.uid(), 'admin')
);
