// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialLinksFields } from "./social-links-fields";

describe("SocialLinksFields", () => {
  it("renders the four fields pre-filled from value", () => {
    render(
      <SocialLinksFields
        value={{ website: "https://a.b", instagram: "https://instagram.com/a" }}
        onChange={() => {}}
        idPrefix="test"
      />,
    );
    expect(screen.getByLabelText(/website/i)).toHaveValue("https://a.b");
    expect(screen.getByLabelText(/instagram/i)).toHaveValue(
      "https://instagram.com/a",
    );
    expect(screen.getByLabelText(/facebook/i)).toHaveValue("");
    expect(screen.getByLabelText(/tiktok/i)).toHaveValue("");
  });

  it("calls onChange with the merged object on edit, dropping empty strings", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SocialLinksFields value={{}} onChange={onChange} idPrefix="test" />,
    );

    await user.type(screen.getByLabelText(/website/i), "h");
    expect(onChange).toHaveBeenLastCalledWith({ website: "h" });
  });
});
