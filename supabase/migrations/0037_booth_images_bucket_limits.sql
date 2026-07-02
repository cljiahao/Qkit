-- Harden the booth-images bucket (T22 / B5). It was created public-read with no
-- size or MIME constraints, so the client-side checks in image-uploader were the
-- only guard — a direct storage API call with a vendor JWT could upload an
-- arbitrarily large file or a non-image (e.g. an HTML payload served from the
-- public bucket). Enforce the limits at the bucket so they hold regardless of
-- client. The uploader resizes + re-encodes to WebP (well under 5 MB); JPEG/PNG
-- are allowed for any pass-through / legacy object.
UPDATE storage.buckets
SET
  file_size_limit = 5242880, -- 5 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'booth-images';
