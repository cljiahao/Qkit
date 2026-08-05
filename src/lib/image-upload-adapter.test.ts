import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors the mocking convention used in `dashboard/booths/actions.test.ts`:
// hoist shared spies/state, mock the supabase client factory module, and let
// each test configure the resolved values it needs.
const h = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: (...args: unknown[]) => h.uploadMock(bucket, ...args),
        getPublicUrl: (...args: unknown[]) =>
          h.getPublicUrlMock(bucket, ...args),
      }),
    },
  }),
}));

import { uploadQkitImage } from "./image-upload-adapter";

beforeEach(() => {
  h.uploadMock.mockReset();
  h.getPublicUrlMock.mockReset();
});

describe("uploadQkitImage", () => {
  it("uploads to the booth-images bucket at vendorId/<uuid>.<ext> and returns the public URL", async () => {
    h.uploadMock.mockResolvedValue({ error: null });
    h.getPublicUrlMock.mockReturnValue({
      data: {
        publicUrl:
          "https://proj.supabase.co/storage/v1/object/public/booth-images/vendor-123/some-uuid.webp",
      },
    });

    const url = await uploadQkitImage({
      bucket: "booth-images",
      path: "vendor-123/some-uuid.webp",
      blob: new Blob(["x"], { type: "image/webp" }),
      contentType: "image/webp",
    });

    expect(url).toMatch(/^https?:\/\//);
    expect(h.uploadMock).toHaveBeenCalledWith(
      "booth-images",
      "vendor-123/some-uuid.webp",
      expect.any(Blob),
      { upsert: false, contentType: "image/webp" },
    );
  });

  it("propagates a storage upload failure", async () => {
    h.uploadMock.mockResolvedValue({ error: new Error("upload failed") });

    await expect(
      uploadQkitImage({
        bucket: "booth-images",
        path: "vendor-123/x.webp",
        blob: new Blob(["x"]),
        contentType: "image/webp",
      }),
    ).rejects.toThrow();
  });
});
