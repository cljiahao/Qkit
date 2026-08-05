// Backend for @merqo/ui's `ImageUploader`: its `onUpload` is injected so the
// component itself never depends on Supabase. `path` arrives already built as
// `${pathPrefix}/${uuid}.${ext}` (the component builds that internally from
// the `pathPrefix` prop, which each call site passes as the vendor id — see
// `ImageUploader`'s source), so this just writes the blob and resolves the
// public URL: the exact call qkit's old local `ImageUploader` made directly
// against `supabase.storage`.
import { createClient } from "@/lib/supabase/client";
import type { ImageUploadPayload } from "@merqo/ui";

/**
 * `vendorId` isn't read here — the path already carries it, built by
 * `ImageUploader` from `pathPrefix={vendorId}` before `onUpload` runs — but
 * it stays part of the factory signature so every call site (
 * `makeQkitImageUpload(vendorId)`) reads as "uploads for this vendor" and the
 * adapter can grow vendor-scoped behavior later without a signature change.
 */
export function makeQkitImageUpload(_vendorId: string) {
  return async function uploadImage({
    bucket,
    path,
    blob,
    contentType,
  }: ImageUploadPayload): Promise<string> {
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { upsert: false, contentType });
    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  };
}
