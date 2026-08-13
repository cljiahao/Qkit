// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentSection } from "./payment-section";
import type { PaymentConfig } from "@/lib/types";

// PaymentSection is controlled, so drive it through a stateful host that feeds
// the latest value back — mirroring how booth-form wires it. No local
// TooltipProvider needed: each radio option's InfoTooltip comes from
// @merqo/ui, which wraps itself in its own internal TooltipProvider (a
// separate module instance from qkit's local radix-ui umbrella entirely).
function Host({
  initial,
  onChange,
}: {
  initial: PaymentConfig | null;
  onChange: (v: PaymentConfig | null) => void;
}) {
  const [value, setValue] = useState<PaymentConfig | null>(initial);
  return (
    <PaymentSection
      vendorId="v1"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("PaymentSection", () => {
  it("emits a paynow config when UEN is filled", () => {
    const onChange = vi.fn();
    render(<Host initial={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /PayNow/i }));
    fireEvent.change(screen.getByLabelText(/Payee name/i), {
      target: { value: "Cart" },
    });
    fireEvent.change(screen.getByLabelText("UEN"), {
      target: { value: "53312345A" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "paynow",
      payee_name: "Cart",
      uen: "53312345A",
    });
  });

  it("emits a paynow config with a +65 mobile number when the Mobile number toggle is picked", () => {
    const onChange = vi.fn();
    render(<Host initial={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /PayNow/i }));
    fireEvent.change(screen.getByLabelText(/Payee name/i), {
      target: { value: "Cart" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Mobile number" }));
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "91234567" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "paynow",
      payee_name: "Cart",
      mobile: "+6591234567",
    });
  });

  it("strips non-digits and caps the mobile field at 8 digits", () => {
    const onChange = vi.fn();
    render(<Host initial={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /PayNow/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Mobile number" }));
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "9123-4567extra" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "paynow",
      payee_name: "",
      mobile: "+6591234567",
    });
  });

  it("clears uen when switching from UEN to Mobile number", () => {
    const onChange = vi.fn();
    render(
      <Host
        initial={{ kind: "paynow", payee_name: "Cart", uen: "53312345A" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Mobile number" }));
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "paynow",
      payee_name: "Cart",
      uen: undefined,
      mobile: undefined,
    });
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "91234567" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "paynow",
      payee_name: "Cart",
      mobile: "+6591234567",
    });
  });

  it("starts on the Mobile number toggle when the existing config has a mobile", () => {
    render(
      <Host
        initial={{
          kind: "paynow",
          payee_name: "Cart",
          mobile: "+6591234567",
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Mobile number")).toHaveValue("91234567");
  });

  it("emits null when 'No online payment' is selected", () => {
    const onChange = vi.fn();
    render(
      <Host
        initial={{ kind: "paynow", payee_name: "x", uen: "53312345A" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /No online payment/i }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("defaults 'pointer' to the payment-link field, not the QR uploader", () => {
    const onChange = vi.fn();
    render(<Host initial={null} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("radio", { name: /Payment link or QR image/i }),
    );
    expect(screen.getByLabelText("Payment link")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add photo/i }),
    ).not.toBeInTheDocument();
  });

  it("switches to the QR uploader and clears the link when that sub-option is picked", () => {
    const onChange = vi.fn();
    render(
      <Host
        initial={{ kind: "pointer", label: "Pay", url: "https://pay.me/x" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "QR image" }));
    expect(screen.queryByLabelText("Payment link")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add photo/i }),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "pointer",
      label: "Pay",
      url: undefined,
      qr_image_url: undefined,
    });
  });

  it("switches back to the link field and clears qr_image_url", () => {
    const onChange = vi.fn();
    render(
      <Host
        initial={{
          kind: "pointer",
          label: "Scan to pay",
          qr_image_url: "https://example.com/qr.webp",
        }}
        onChange={onChange}
      />,
    );
    // No url and a qr_image_url set → starts in QR mode.
    expect(screen.queryByLabelText("Payment link")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Payment link" }));
    expect(screen.getByLabelText("Payment link")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "pointer",
      label: "Scan to pay",
      url: undefined,
      qr_image_url: undefined,
    });
  });

  it("links out to paykit's vendor dashboard", () => {
    render(<Host initial={null} onChange={vi.fn()} />);
    const link = screen.getByRole("link", { name: /manage payments.*paykit/i });
    expect(link).toHaveAttribute(
      "href",
      "https://paykit-sg.vercel.app/dashboard",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
