// EMVCo-compliant PayNow QR payload builder. Pure — no I/O. QKit never touches
// funds; this only renders a QR the customer scans in their own bank app.

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the ASCII of `s`. */
export function crc16(s: string): number {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

/** One EMVCo TLV field: 2-char id + 2-char zero-padded length + value. */
function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, "0") + value;
}

export function buildPayNowPayload(args: {
  uen?: string;
  mobile?: string;
  payeeName: string;
  amountCents: number;
  reference: string;
  editable?: boolean;
}): string {
  const isUen = Boolean(args.uen);
  const proxyType = isUen ? "2" : "0";
  const proxyValue = (args.uen ?? args.mobile ?? "").trim();

  // Merchant account information template (ID 26) for PayNow.
  const merchant = tlv(
    "26",
    tlv("00", "SG.PAYNOW") +
      tlv("01", proxyType) +
      tlv("02", proxyValue) +
      tlv("03", args.editable ? "1" : "0"),
  );

  const amount = (args.amountCents / 100).toFixed(2);

  const body =
    tlv("00", "01") + // payload format indicator
    tlv("01", "12") + // dynamic QR (single use)
    merchant +
    tlv("52", "0000") + // merchant category code (unset)
    tlv("53", "702") + // currency: SGD (ISO 4217 numeric)
    tlv("54", amount) +
    tlv("58", "SG") + // country
    tlv("59", args.payeeName.slice(0, 25)) + // merchant name
    tlv("60", "Singapore") + // merchant city
    tlv("62", tlv("01", args.reference.slice(0, 25))); // additional data: bill ref

  // CRC is computed over the body plus the CRC tag+length ("6304").
  const withCrcTag = body + "6304";
  const crc = crc16(withCrcTag).toString(16).toUpperCase().padStart(4, "0");
  return withCrcTag + crc;
}
