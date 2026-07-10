// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentSection } from "./payment-section";
import type { PaymentConfig } from "@/lib/types";

// PaymentSection is controlled, so drive it through a stateful host that feeds
// the latest value back — mirroring how booth-form wires it.
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
    fireEvent.change(screen.getByLabelText(/UEN/i), {
      target: { value: "53312345A" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "paynow",
      payee_name: "Cart",
      uen: "53312345A",
    });
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

  it("offers a QR image upload alongside the payment link for 'pointer'", () => {
    const onChange = vi.fn();
    render(<Host initial={null} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("radio", { name: /Payment link or QR image/i }),
    );
    expect(screen.getByLabelText("Payment link")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add photo/i }),
    ).toBeInTheDocument();
  });

  it("keeps an existing qr_image_url when the label changes", () => {
    const onChange = vi.fn();
    render(
      <Host
        initial={{
          kind: "pointer",
          label: "",
          qr_image_url: "https://example.com/qr.webp",
        }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Button label/i), {
      target: { value: "Scan to pay" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "pointer",
      label: "Scan to pay",
      url: undefined,
      qr_image_url: "https://example.com/qr.webp",
    });
  });
});
