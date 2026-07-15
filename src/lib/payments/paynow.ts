// EMVCo-compliant PayNow QR payload builder. Pure — no I/O. qkit never touches
// funds; this only renders a QR the customer scans in their own bank app.

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the UTF-8 bytes of `s`.
 * Byte semantics (not charCodeAt) so a multibyte payee name produces the same
 * CRC a scanner computes over the QR's byte stream. ASCII is unaffected.
 */
export function crc16(s: string): number {
  const bytes = new TextEncoder().encode(s);
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

/**
 * One EMVCo TLV field: 2-char id + 2-char zero-padded length + value. The
 * length counts UTF-8 BYTES (not UTF-16 code units), so a multibyte payee name
 * (e.g. a CJK stall name) declares the length the banking app actually parses.
 */
function tlv(id: string, value: string): string {
  const byteLen = new TextEncoder().encode(value).length;
  return id + byteLen.toString().padStart(2, "0") + value;
}

export function buildPayNowPayload(args: {
  uen?: string;
  mobile?: string;
  payeeName: string;
  amountCents: number;
  reference: string;
}): string {
  const isUen = Boolean(args.uen);
  const proxyType = isUen ? "2" : "0";
  const proxyValue = (args.uen ?? args.mobile ?? "").trim();

  // Merchant account information template (ID 26) for PayNow. Amount is fixed
  // (editable flag "0") — every QR is a single-use, per-order dynamic code.
  const merchant = tlv(
    "26",
    tlv("00", "SG.PAYNOW") +
      tlv("01", proxyType) +
      tlv("02", proxyValue) +
      tlv("03", "0"),
  );

  const amount = (args.amountCents / 100).toFixed(2);

  const body =
    // payload format indicator
    tlv("00", "01") +
    // dynamic QR (single use)
    tlv("01", "12") +
    merchant +
    // merchant category code (unset)
    tlv("52", "0000") +
    // currency: SGD (ISO 4217 numeric)
    tlv("53", "702") +
    tlv("54", amount) +
    // country
    tlv("58", "SG") +
    // merchant name
    tlv("59", args.payeeName.slice(0, 25)) +
    // merchant city
    tlv("60", "Singapore") +
    // additional data: bill ref
    tlv("62", tlv("01", args.reference.slice(0, 25)));

  // CRC is computed over the body plus the CRC tag+length ("6304").
  const withCrcTag = body + "6304";
  const crc = crc16(withCrcTag).toString(16).toUpperCase().padStart(4, "0");
  return withCrcTag + crc;
}
