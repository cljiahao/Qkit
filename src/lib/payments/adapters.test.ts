import { describe, expect, it } from "vitest";
import { renderCheckout } from "./adapters";

const ctx = { amountCents: 450, orderRef: "12" };

describe("renderCheckout", () => {
  it("pointer with a url → link view", () => {
    const v = renderCheckout(
      { kind: "pointer", label: "PayLah", url: "https://a.b" },
      ctx,
    );
    expect(v).toEqual({ type: "link", url: "https://a.b", label: "PayLah" });
  });

  it("pointer with only a qr image → image view", () => {
    const v = renderCheckout(
      { kind: "pointer", label: "Scan", qr_image_url: "/seed/qr.png" },
      ctx,
    );
    expect(v).toEqual({ type: "image", url: "/seed/qr.png" });
  });

  it("paynow → qr view whose payload encodes the amount", () => {
    const v = renderCheckout(
      { kind: "paynow", payee_name: "Cart", uen: "53312345A" },
      ctx,
    );
    expect(v?.type).toBe("qr");
    if (v?.type === "qr") expect(v.payload).toContain("54044.50");
  });

  it("stripe → null (reserved but dark)", () => {
    expect(renderCheckout({ kind: "stripe", account_id: "acct_1" }, ctx)).toBe(
      null,
    );
  });

  it("pointer with neither url nor image → null", () => {
    expect(renderCheckout({ kind: "pointer", label: "x" }, ctx)).toBe(null);
  });
});
