// Backend for @merqo/ui's `ImageUploader`: its `onUpload` is injected so the
// component itself never depends on Supabase. `path` arrives already built as
// `${pathPrefix}/${uuid}.${ext}` — `ImageUploader` builds that internally
// from the `pathPrefix` prop each call site passes as the vendor id (see its
// source), so there's no vendor-scoped work left to do here: this just writes
// the blob and resolves the public URL, the exact call qkit's old local
// `ImageUploader` made directly against `supabase.storage`. A plain function
// (not a factory) — `path` already carries everything call-site-specific.
import { createClient } from "@/lib/supabase/client";
import type { ImageUploaderProps } from "@merqo/ui";

export const uploadQkitImage: ImageUploaderProps["onUpload"] = async ({
  bucket,
  path,
  blob,
  contentType,
}) => {
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
