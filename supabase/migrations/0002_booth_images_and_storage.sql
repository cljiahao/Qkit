-- Booth banner image
ALTER TABLE public.booths ADD COLUMN image_url TEXT;

-- Public-read bucket for booth banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('booth-images', 'booth-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone may read banner images (customer ordering pages)
CREATE POLICY "booth_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'booth-images');

-- A vendor may write only under their own "{auth.uid()}/..." path
CREATE POLICY "booth_images_vendor_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'booth-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "booth_images_vendor_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'booth-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "booth_images_vendor_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'booth-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
