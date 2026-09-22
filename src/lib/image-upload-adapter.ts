// Backend for @merqo/ui's `ImageUploader`: its `onUpload` is injected so the
// component itself never depends on Supabase. `path` arrives already built as
// `${pathPrefix}/${uuid}.${ext}` — `ImageUploader` builds that internally
// from the `pathPrefix` prop each call site passes as the vendor id (see its
// source), so there's no vendor-scoped work left to do here: this just writes
// the blob and resolves the public URL, the exact call qkit's old local
// `ImageUploader` made directly against `supabase.storage`. A plain function
// (not a factory) — `path` already carries everything call-site-specific.
import { createClient } from "@/lib/supabase/client";
import { storagePathFromPublicUrl, type ImageUploaderProps } from "@merqo/ui";

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

// Every public bucket a vendor's avatar can live in. All five Merqo apps share
// one Supabase project and one signed-in user, so `avatar_url` is a single
// field: a vendor may have set it from any app, into that app's bucket.
const AVATAR_BUCKETS = [
  "booth-images",
  "vendor-images",
  "vendor-avatars",
] as const;

/**
 * Best-effort delete of an avatar image that is no longer referenced — the
 * one just replaced, or a fresh upload whose save failed. Never throws: the
 * avatar change itself has already succeeded or failed by the time this runs,
 * and a leftover object is only wasted storage. Anything that is not a public
 * URL in one of our buckets (a Google profile picture, say) is ignored, and
 * each bucket's owner-folder DELETE policy stops a vendor removing anything
 * but their own objects.
 */
export async function removeReplacedAvatar(
  url: string | null | undefined,
): Promise<void> {
  for (const bucket of AVATAR_BUCKETS) {
    const path = storagePathFromPublicUrl(url, bucket);
    if (!path) continue;
    await createClient()
      .storage.from(bucket)
      .remove([path])
      .catch(() => undefined);
    return;
  }
}

/**
 * Best-effort delete of booth-images uploads that no save ended up using: a
 * form committed its pending images on submit, then an upload or the save
 * itself failed before anything referenced them. Only for saves that write
 * nothing on failure; `saveBooth` cleans up its own, because a failed save
 * there can still have stored the payment QR in paykit. Never throws, and the
 * bucket's owner-folder DELETE policy bounds what it can remove.
 */
export async function removeUnsavedImages(
  urls: readonly string[],
): Promise<void> {
  const paths = urls.flatMap((url) => {
    const path = storagePathFromPublicUrl(url, "booth-images");
    return path ? [path] : [];
  });
  if (paths.length === 0) return;
  await createClient()
    .storage.from("booth-images")
    .remove(paths)
    .catch(() => undefined);
}
