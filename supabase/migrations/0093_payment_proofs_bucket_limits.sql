-- Harden the payment-proofs bucket, same treatment booth-images got in 0037.
-- 0087 created it with no size or MIME constraint, so the only thing bounding
-- what lands in storage was the app: the browser's resize in pay-form.tsx
-- (bypassable) and Next's default 1 MB Server Action body limit (a framework
-- default, not a decision anyone made). Every customer order that pays by
-- screenshot writes one object here, so an unbounded bucket grows with order
-- volume. Enforce the limits at the bucket so they hold regardless of client.
--
-- 1 MB matches both the Server Action ceiling and claimPayment's own
-- PAYMENT_PROOF_MAX_BYTES; a real proof, resized to <=1600px WebP/JPEG in the
-- browser, is typically a few hundred KB. PNG stays allowed for a screenshot
-- the browser could not re-encode and passed through unchanged.
UPDATE storage.buckets
SET
  file_size_limit = 1048576, -- 1 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'payment-proofs';
