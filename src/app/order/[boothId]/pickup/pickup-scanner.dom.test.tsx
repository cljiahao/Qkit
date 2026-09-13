// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PickupScanner } from "./pickup-scanner";

const { confirmCollectionMock } = vi.hoisted(() => ({
  confirmCollectionMock: vi.fn(),
}));
vi.mock("../[orderNumber]/collect-actions", () => ({
  confirmCollection: confirmCollectionMock,
}));

beforeEach(() => {
  confirmCollectionMock.mockReset();
});

describe("PickupScanner", () => {
  it("auto-focuses its input on mount", () => {
    render(<PickupScanner boothId="b1" />);
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("parses a scanned URL for this booth, calls confirmCollection, and flashes success", async () => {
    confirmCollectionMock.mockResolvedValueOnce({
      success: true,
      status: "completed",
    });
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(
      input,
      "https://qkit.example/order/b1/0007?t=11111111-1111-1111-1111-111111111111{Enter}",
    );
    expect(confirmCollectionMock).toHaveBeenCalledWith(
      "b1",
      "0007",
      "11111111-1111-1111-1111-111111111111",
    );
    expect(
      await screen.findByText(/order #0007 collected/i),
    ).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("rejects a scan for a different booth without calling confirmCollection", async () => {
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(
      input,
      "https://qkit.example/order/b2/0007?t=11111111-1111-1111-1111-111111111111{Enter}",
    );
    expect(confirmCollectionMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/wrong stall/i)).toBeInTheDocument();
  });

  it("disables the input while a scan is being processed, re-enabling after", async () => {
    let resolveCall: (v: unknown) => void = () => {};
    confirmCollectionMock.mockReturnValueOnce(
      new Promise((r) => {
        resolveCall = r;
      }),
    );
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(
      input,
      "https://qkit.example/order/b1/0007?t=11111111-1111-1111-1111-111111111111{Enter}",
    );
    expect(input).toBeDisabled();
    resolveCall({ success: true, status: "completed" });
    await waitFor(() => expect(input).not.toBeDisabled());
  });

  it("ignores an unparseable scan", async () => {
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "garbage-not-a-url{Enter}");
    expect(confirmCollectionMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/couldn't read that/i)).toBeInTheDocument();
  });
});
