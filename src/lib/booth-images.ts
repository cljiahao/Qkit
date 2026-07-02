// Helpers for reclaiming orphaned booth-image storage objects. Uploads land at
// a fresh random path each time (image-uploader), so replacing or removing an
// image, or deleting a booth, leaves the old object behind. saveBooth/deleteBooth
// use these to remove the objects a booth no longer references.

const PUBLIC_MARKER = "/storage/v1/object/public/booth-images/";

/**
 * Extract the in-bucket path ("{vendorId}/{file}") from a booth-images public
 * URL. Returns null for anything that isn't an uploaded object — seed art
 * (`/seed/...`), external URLs, or a malformed value — so those are never
 * targeted for deletion.
 */
export function storagePathFromPublicUrl(url: string): string | null {
  const i = url.indexOf(PUBLIC_MARKER);
  if (i === -1) return null;
  const path = url.slice(i + PUBLIC_MARKER.length);
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

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
    const p = storagePathFromPublicUrl(u);
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
