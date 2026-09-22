import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, removeMock } = vi.hoisted(() => {
  const removeMock = vi.fn(async () => ({
    data: [],
    error: null,
  }));
  const fromMock = vi.fn(() => ({ remove: removeMock }));
  return { fromMock, removeMock };
});
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: fromMock } }),
}));

import { removeReplacedAvatar } from "./image-upload-adapter";

const PUBLIC = "https://abc.supabase.co/storage/v1/object/public";

describe("removeReplacedAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // All five apps share one signed-in user, so the avatar being replaced may
  // sit in any app's bucket, not just this one's.
  it.each(["booth-images", "vendor-images", "vendor-avatars"])(
    "deletes the object when the URL is in %s",
    async (bucket) => {
      await removeReplacedAvatar(`${PUBLIC}/${bucket}/v1/old.webp`);
      expect(fromMock).toHaveBeenCalledWith(bucket);
      expect(removeMock).toHaveBeenCalledWith(["v1/old.webp"]);
    },
  );

  it("never deletes an OAuth provider's avatar", async () => {
    await removeReplacedAvatar(
      "https://lh3.googleusercontent.com/a/ACg8oc=s96-c",
    );
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("ignores a URL in a bucket that is not an avatar bucket", async () => {
    await removeReplacedAvatar(`${PUBLIC}/some-other-bucket/v1/x.webp`);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("does nothing for %j", async (url) => {
    await removeReplacedAvatar(url);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("never throws, even when the delete itself fails", async () => {
    removeMock.mockRejectedValueOnce(new Error("network down"));
    await expect(
      removeReplacedAvatar(`${PUBLIC}/vendor-avatars/v1/old.webp`),
    ).resolves.toBeUndefined();
  });
});
