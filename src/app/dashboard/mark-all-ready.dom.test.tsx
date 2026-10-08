// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkAllReadyButton } from "./mark-all-ready";

describe("MarkAllReadyButton", () => {
  it("is hidden below two orders, where the ticket's own button is one tap", () => {
    const { container } = render(
      <MarkAllReadyButton count={1} busy={false} onConfirm={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("asks before doing anything, naming how many orders", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<MarkAllReadyButton count={7} busy={false} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Mark all ready" }));

    expect(
      await screen.findByRole("alertdialog", {
        name: "Mark all 7 orders ready?",
      }),
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does nothing when the vendor backs out", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<MarkAllReadyButton count={7} busy={false} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Mark all ready" }));
    await user.click(await screen.findByRole("button", { name: "Not yet" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("marks them all once confirmed", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<MarkAllReadyButton count={7} busy={false} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Mark all ready" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      // The dialog's own confirm, not the trigger behind it.
      [...dialog.querySelectorAll("button")].find(
        (b) => b.textContent === "Mark all ready",
      )!,
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cannot be opened while a batch is already running", () => {
    render(<MarkAllReadyButton count={7} busy onConfirm={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Mark all ready" }),
    ).toBeDisabled();
  });
});
