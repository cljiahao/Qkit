import { describe, it, expect } from "vitest";
import {
  storagePathFromPublicUrl,
  boothImagePaths,
  orphanedImagePaths,
} from "./booth-images";

const BASE = "https://proj.supabase.co/storage/v1/object/public/booth-images/";

describe("storagePathFromPublicUrl", () => {
  it("extracts the in-bucket path from an uploaded object URL", () => {
    expect(storagePathFromPublicUrl(`${BASE}vendor1/abc.webp`)).toBe(
      "vendor1/abc.webp",
    );
  });

  it("decodes percent-encoded segments", () => {
    expect(storagePathFromPublicUrl(`${BASE}vendor1/a%20b.webp`)).toBe(
      "vendor1/a b.webp",
    );
  });

  it("returns null for seed art, external URLs, and junk", () => {
    expect(storagePathFromPublicUrl("/seed/coffee.png")).toBeNull();
    expect(storagePathFromPublicUrl("https://example.com/x.png")).toBeNull();
    expect(storagePathFromPublicUrl("")).toBeNull();
    expect(storagePathFromPublicUrl(`${BASE}`)).toBeNull();
  });
});

describe("boothImagePaths", () => {
  it("collects the banner and each menu item photo, deduped, uploads only", () => {
    const paths = boothImagePaths({
      image_url: `${BASE}v1/banner.webp`,
      menu_items: [
        { image_url: `${BASE}v1/item1.webp` },
        { image_url: "/seed/local.png" }, // seed → skipped
        { image_url: `${BASE}v1/item1.webp` }, // dup → collapsed
        { image_url: null },
        {},
      ],
    });
    expect(paths.sort()).toEqual(["v1/banner.webp", "v1/item1.webp"]);
  });

  it("tolerates a null banner and a non-array menu", () => {
    expect(boothImagePaths({ image_url: null, menu_items: null })).toEqual([]);
  });
});

describe("orphanedImagePaths", () => {
  it("returns paths dropped from before → after", () => {
    const before = {
      image_url: `${BASE}v1/old-banner.webp`,
      menu_items: [{ image_url: `${BASE}v1/keep.webp` }],
    };
    const after = {
      image_url: `${BASE}v1/new-banner.webp`,
      menu_items: [{ image_url: `${BASE}v1/keep.webp` }],
    };
    expect(orphanedImagePaths(before, after)).toEqual(["v1/old-banner.webp"]);
  });

  it("returns nothing when the image set is unchanged", () => {
    const row = { image_url: `${BASE}v1/b.webp`, menu_items: [] };
    expect(orphanedImagePaths(row, row)).toEqual([]);
  });
});
