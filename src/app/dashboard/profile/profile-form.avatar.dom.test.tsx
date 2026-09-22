// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { updateUserMock, removeReplacedAvatarMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn(),
  removeReplacedAvatarMock: vi.fn(),
}));

vi.mock("./actions", () => ({
  updateStallName: vi.fn(),
  updateSocialLinks: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser: updateUserMock } }),
}));
vi.mock("@/lib/image-upload-adapter", () => ({
  uploadQkitImage: vi.fn(),
  removeReplacedAvatar: removeReplacedAvatarMock,
}));
vi.mock("@merqo/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@merqo/ui")>()),
  // Stands in for a finished upload (or a Remove click) by calling onChange
  // directly, which is all the avatar save handler sees.
  ImageUploader: ({ onChange }: { onChange: (url: string | null) => void }) => (
    <div>
      <button type="button" onClick={() => onChange(NEW_AVATAR)}>
        finish upload
      </button>
      <button type="button" onClick={() => onChange(null)}>
        remove icon
      </button>
    </div>
  ),
}));

import { ProfileForm } from "./profile-form";

const PUBLIC = "https://abc.supabase.co/storage/v1/object/public";
const OLD_AVATAR = `${PUBLIC}/booth-images/v1/old.webp`;
const NEW_AVATAR = `${PUBLIC}/booth-images/v1/new.webp`;

function renderForm(avatarUrl: string | null) {
  return render(
    <ProfileForm
      stallName="Kopitiam Cart"
      displayName=""
      email="a@b.com"
      vendorId="v1"
      socialLinks={{}}
      avatarUrl={avatarUrl}
    />,
  );
}

// ImageUploader gives every upload a fresh random object name, so without
// these deletes each avatar change left the previous image in storage forever.
describe("ProfileForm avatar storage cleanup", () => {
  beforeEach(() => {
    updateUserMock.mockReset().mockResolvedValue({ error: null });
    removeReplacedAvatarMock.mockReset().mockResolvedValue(undefined);
  });

  it("deletes the previous avatar once the new one is saved", async () => {
    const user = userEvent.setup();
    renderForm(OLD_AVATAR);
    await user.click(screen.getByRole("button", { name: "finish upload" }));
    await waitFor(() =>
      expect(removeReplacedAvatarMock).toHaveBeenCalledWith(OLD_AVATAR),
    );
    expect(removeReplacedAvatarMock).not.toHaveBeenCalledWith(NEW_AVATAR);
  });

  it("deletes the avatar when the vendor removes it", async () => {
    const user = userEvent.setup();
    renderForm(OLD_AVATAR);
    await user.click(screen.getByRole("button", { name: "remove icon" }));
    await waitFor(() =>
      expect(removeReplacedAvatarMock).toHaveBeenCalledWith(OLD_AVATAR),
    );
  });

  it("keeps the previous avatar and deletes the orphaned upload when the save fails", async () => {
    updateUserMock.mockResolvedValueOnce({ error: { message: "nope" } });
    const user = userEvent.setup();
    renderForm(OLD_AVATAR);
    await user.click(screen.getByRole("button", { name: "finish upload" }));
    await waitFor(() =>
      expect(removeReplacedAvatarMock).toHaveBeenCalledWith(NEW_AVATAR),
    );
    expect(removeReplacedAvatarMock).not.toHaveBeenCalledWith(OLD_AVATAR);
  });

  it("deletes nothing on a first upload, when there was no previous avatar", async () => {
    const user = userEvent.setup();
    renderForm(null);
    await user.click(screen.getByRole("button", { name: "finish upload" }));
    await waitFor(() => expect(updateUserMock).toHaveBeenCalled());
    expect(removeReplacedAvatarMock).not.toHaveBeenCalled();
  });
});
