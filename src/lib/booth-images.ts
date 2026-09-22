// Helpers for reclaiming orphaned booth-image storage objects. Uploads land at
// a fresh random path each time (via image-upload-adapter.ts, consumed by
// @merqo/ui's ImageUploader), so replacing or removing an image, or deleting
// a booth, leaves the old object behind. saveBooth/deleteBooth use these to
// remove the objects a booth no longer references.

import { storagePathFromPublicUrl } from "@merqo/ui";

// A banner or menu photo that is not an uploaded booth-images object (seed art
// under `/seed/...`, an external URL, junk) maps to null, so it is never
// targeted for deletion.
const BUCKET = "booth-images";

type ImageRow = {
  image_url?: string | null;
  menu_items?: unknown;
};

/**
 * Every uploaded-object path a booth row references: its banner plus each menu
 * item's photo. Deduped; non-uploads (seed/external) are dropped.
 */
export function boothImagePaths(row: ImageRow): string[] {
  const urls: string[] = [];
  if (typeof row.image_url === "string") urls.push(row.image_url);
  if (Array.isArray(row.menu_items)) {
    for (const item of row.menu_items) {
      const u = (item as { image_url?: unknown } | null)?.image_url;
      if (typeof u === "string") urls.push(u);
    }
  }
  const paths = new Set<string>();
  for (const u of urls) {
    const p = storagePathFromPublicUrl(u, BUCKET);
    if (p) paths.add(p);
  }
  return [...paths];
}

/** Paths referenced by `before` but no longer by `after` — safe to delete. */
export function orphanedImagePaths(
  before: ImageRow,
  after: ImageRow,
): string[] {
  const keep = new Set(boothImagePaths(after));
  return boothImagePaths(before).filter((p) => !keep.has(p));
}
