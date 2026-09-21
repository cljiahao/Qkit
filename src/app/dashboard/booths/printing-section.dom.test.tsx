// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintingSection } from "./printing-section";

type StatusBody = {
  reachable: boolean;
  printer: {
    display_name: string;
    state: "online" | "offline" | "not_set_up";
    hardware_verified: boolean;
  } | null;
};

function respondsWith(body: StatusBody | null) {
  const fetchMock = vi.fn(async () =>
    body
      ? new Response(JSON.stringify(body))
      : new Response("{}", { status: 500 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ONLINE: StatusBody = {
  reachable: true,
  printer: {
    display_name: "Feie FP-N20H",
    state: "online",
    hardware_verified: false,
  },
};

const OFFLINE: StatusBody = {
  reachable: true,
  printer: {
    display_name: "Feie FP-N20H",
    state: "offline",
    hardware_verified: false,
  },
};

const NO_PRINTER: StatusBody = { reachable: true, printer: null };

describe("PrintingSection", () => {
  const originalUrl = process.env.NEXT_PUBLIC_PRINTKIT_URL;

  beforeEach(() => {
    respondsWith(NO_PRINTER);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // process.env.X = undefined stringifies to "undefined" in Node, not
    // unset — delete instead when there was nothing there to restore.
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_PRINTKIT_URL;
    else process.env.NEXT_PUBLIC_PRINTKIT_URL = originalUrl;
  });

  it("calls onChange with the new value when toggled", () => {
    const onChange = vi.fn();
    render(<PrintingSection value={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects a true value as checked", () => {
    render(<PrintingSection value={true} onChange={vi.fn()} />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("asks printkit nothing until the booth has been saved", () => {
    const fetchMock = respondsWith(NO_PRINTER);
    render(<PrintingSection value={false} onChange={vi.fn()} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the printer even while printing is off, so the toggle can warn", async () => {
    const fetchMock = respondsWith(OFFLINE);
    render(<PrintingSection value={false} onChange={vi.fn()} boothId="b1" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it("reads this booth's status through qkit, never printkit directly", async () => {
    const fetchMock = respondsWith(ONLINE);
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/printkit/printer-status?booth=booth-42",
        expect.anything(),
      );
    });
  });

  it("names the connected printer", async () => {
    respondsWith(ONLINE);
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );

    expect(await screen.findByText("Printer connected")).toBeInTheDocument();
    expect(screen.getByText("Feie FP-N20H")).toBeInTheDocument();
  });

  it("warns that orders will not print when no printer is set up", async () => {
    respondsWith(NO_PRINTER);
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );

    expect(
      await screen.findByText(/no printer is set up for this booth yet/i),
    ).toBeInTheDocument();
  });

  it("confirms before turning printing on while the printer is offline", async () => {
    const onChange = vi.fn();
    const fetchMock = respondsWith(OFFLINE);
    render(
      <PrintingSection value={false} onChange={onChange} boothId="booth-42" />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("switch"));

    expect(onChange).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: /turn on anyway/i }),
    ).toBeInTheDocument();
  });

  it("turns printing on without asking when the printer is online", async () => {
    const onChange = vi.fn();
    const fetchMock = respondsWith(ONLINE);
    render(
      <PrintingSection value={false} onChange={onChange} boothId="booth-42" />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("prompts to save the booth first when enabled but unsaved", () => {
    render(<PrintingSection value={true} onChange={vi.fn()} />);

    expect(
      screen.getByText(
        "Save this booth first to choose its printer in printkit.",
      ),
    ).toBeInTheDocument();
  });

  it("links to printkit's printers page", () => {
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );

    const link = screen.getByRole("link", {
      name: "Choose the printer for this booth →",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://printkit.test/dashboard/printers",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("explains that a Bluetooth printer needs a second device", () => {
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );

    expect(screen.getByText(/works with just your iPad/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "read why" })).toHaveAttribute(
      "href",
      "https://printkit.test/guides/bluetooth-printers",
    );
  });

  it("falls back to a not-configured hint when printkit's URL is unset", () => {
    delete process.env.NEXT_PUBLIC_PRINTKIT_URL;
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );

    expect(
      screen.getByText("Printing isn't configured yet."),
    ).toBeInTheDocument();
  });

  it("says printkit is unreachable rather than claiming no printer", async () => {
    respondsWith(null);
    render(
      <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
    );

    expect(
      await screen.findByText(/can't reach printkit/i),
    ).toBeInTheDocument();
  });
});
