import { describe, expect, it } from "vitest";
import { buildPayNowPayload, crc16 } from "./paynow";

describe("crc16 (CRC-16/CCITT-FALSE)", () => {
  it("matches the known check value for '123456789'", () => {
    // CRC-16/CCITT-FALSE check value is 0x29B1.
    expect(crc16("123456789")).toBe(0x29b1);
  });
});

describe("buildPayNowPayload", () => {
  it("emits a UEN payload that ends with a 4-hex CRC and contains SG.PAYNOW", () => {
    const s = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "Kopitiam Cart",
      amountCents: 450,
      reference: "12",
    });
    expect(s).toContain("SG.PAYNOW");
    expect(s).toContain("53312345A");
    // Amount field 54 = "4.50".
    expect(s).toContain("54044.50");
    // Ends with CRC tag 6304 + 4 hex chars.
    expect(s).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("uses proxy type 0 for mobile, 2 for UEN", () => {
    // Proxy-type TLV is id 01, len 01, value 0 (mobile) / 2 (UEN), placed
    // right after the SG.PAYNOW identifier in the merchant template.
    expect(
      buildPayNowPayload({
        mobile: "+6591234567",
        payeeName: "x",
        amountCents: 100,
        reference: "1",
      }),
    ).toContain("SG.PAYNOW0101" + "0");
    expect(
      buildPayNowPayload({
        uen: "53312345A",
        payeeName: "x",
        amountCents: 100,
        reference: "1",
      }),
    ).toContain("SG.PAYNOW0101" + "2");
  });

  it("declares EMVCo lengths in UTF-8 bytes for a non-ASCII payee", () => {
    // "珍珠" is 2 UTF-16 units but 6 UTF-8 bytes → tag 59 length must be 06.
    const s = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "珍珠",
      amountCents: 100,
      reference: "1",
    });
    expect(s).toContain("5906珍珠");
  });

  it("round-trips its own CRC (recomputing over the body matches the suffix)", () => {
    const s = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "x",
      amountCents: 100,
      reference: "1",
    });
    const body = s.slice(0, -4); // strip the 4 hex CRC chars, keep "...6304"
    const expected = crc16(body).toString(16).toUpperCase().padStart(4, "0");
    expect(s.slice(-4)).toBe(expected);
  });
});
