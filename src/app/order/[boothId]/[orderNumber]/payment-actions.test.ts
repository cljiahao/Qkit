import { createHash } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  claimPayment,
  unclaimPayment,
  getPaymentStatus,
  loadPreClaimContext,
} from "./payment-actions";

// Mock the service client. Each table read goes through a depth-flexible
// eq-chain ending in maybeSingle() -- real callers in this file vary in how
// many .eq() calls precede the terminal read (loadCheckoutContext's 3-eq
// order lookup vs. loadPreClaimContext/claimPayment's 2-eq one), and the mock
// doesn't care how many, only what it resolves to:
//   orders:  select().eq()[.eq()...].maybeSingle()
//            update().eq()[.eq()...][.neq()][.select()] -- unclaimPayment's
//            mirror write still terminates in .select("id") (unchanged); the
//            new claimPayment's mirror write is awaited directly with no
//            .select() call, so the chain is also directly thenable.
//   booths:  select().eq().maybeSingle()
//   storage: from("payment-proofs").upload(...)
//   rpc:     rpc("assign_order_number", { p_order_id })
const {
  createServiceClientMock,
  ordersMaybeSingle,
  boothsMaybeSingle,
  update,
  writeSelect,
  storageUploadMock,
  rpcMock,
  rateLimitMock,
  clientIpMock,
} = vi.hoisted(() => {
  const ordersMaybeSingle = vi.fn();
  const boothsMaybeSingle = vi.fn();
  const writeSelect = vi.fn();
  const storageUploadMock = vi.fn();
  const rpcMock = vi.fn();

  function readChain(maybeSingleFn: () => unknown) {
    const node = { eq: () => node, maybeSingle: maybeSingleFn };
    return node;
  }
  const ordersSelect = () => readChain(ordersMaybeSingle);
  const boothsSelect = () => readChain(boothsMaybeSingle);

  const update = vi.fn(() => {
    const node = {
      eq: () => node,
      neq: () => node,
      select: writeSelect,
      then: (onFulfilled: unknown, onRejected: unknown) =>
        writeSelect().then(
          onFulfilled as (v: unknown) => unknown,
          onRejected as (v: unknown) => unknown,
        ),
    };
    return node;
  });

  const from = (table: string) =>
    table === "booths"
      ? { select: boothsSelect }
      : { select: ordersSelect, update };
  return {
    createServiceClientMock: vi.fn(() =>
      Promise.resolve({
        from,
        storage: { from: () => ({ upload: storageUploadMock }) },
        rpc: rpcMock,
      }),
    ),
    ordersMaybeSingle,
    boothsMaybeSingle,
    update,
    writeSelect,
    storageUploadMock,
    rpcMock,
    rateLimitMock: vi.fn(),
    clientIpMock: vi.fn(() => "1.2.3.4"),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  clientIp: clientIpMock,
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({}) }));

const { createCheckoutMock, claimCheckoutMock, unclaimCheckoutMock } =
  vi.hoisted(() => ({
    createCheckoutMock: vi.fn(),
    claimCheckoutMock: vi.fn(),
    unclaimCheckoutMock: vi.fn(),
  }));
vi.mock("@/lib/paykit/client", () => ({
  createCheckout: createCheckoutMock,
  claimCheckout: claimCheckoutMock,
  unclaimCheckout: unclaimCheckoutMock,
}));

const { resizeToWebpMock } = vi.hoisted(() => ({
  resizeToWebpMock: vi.fn(),
}));
vi.mock("@merqo/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@merqo/ui")>()),
  resizeToWebp: resizeToWebpMock,
}));

const { notifyVendorTelegramMock, notifyPrintkitMock } = vi.hoisted(() => ({
  notifyVendorTelegramMock: vi.fn(),
  notifyPrintkitMock: vi.fn(),
}));
vi.mock("@/app/o/[code]/notify", () => ({
  notifyVendorTelegram: notifyVendorTelegramMock,
  notifyPrintkit: notifyPrintkitMock,
}));

const BOOTH = "00000000-0000-4000-8000-000000000001";
const ORDER = "A17";
const TOKEN = "11111111-2222-4333-8444-555555555555";

// The exact bytes claimPayment's mocked resizeToWebp hands back -- used both
// as the upload payload and to independently compute the expected
// payment_proof_hash via the real (unmocked) hashBuffer, so the assertion
// verifies real hashing behavior rather than re-asserting a mocked value.
const PHOTO_BYTES = "resized-photo-bytes";
function expectedHash(bytes: string): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

function fakeFile(): File {
  return new File(["raw-upload-bytes"], "proof.jpg", { type: "image/jpeg" });
}

beforeEach(() => {
  createServiceClientMock.mockClear();
  update.mockClear();
  ordersMaybeSingle.mockReset().mockResolvedValue({
    data: {
      id: "o1",
      total_cents: 800,
      payment_status: "pending",
      status: "preparing",
      customer_name: "Ann",
    },
  });
  boothsMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: { vendor_id: "v1", print_enabled: false } });
  // Default: the guarded mirror UPDATE matched its row.
  writeSelect
    .mockReset()
    .mockResolvedValue({ data: [{ id: "o1" }], error: null });
  storageUploadMock
    .mockReset()
    .mockResolvedValue({ data: { path: "v1/o1.webp" }, error: null });
  rpcMock.mockReset().mockResolvedValue({ data: "0007", error: null });
  rateLimitMock.mockReset().mockResolvedValue(true);
  clientIpMock.mockClear();
  createCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: { type: "qr", transactionId: "tx1", payload: "0002" },
  });
  claimCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: {
      transactionId: "tx1",
      status: "claimed",
      amountCents: 800,
      orderRef: "o1",
      claimedAt: "2026-08-11T00:00:00Z",
      confirmedAt: null,
    },
  });
  unclaimCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: {
      transactionId: "tx1",
      status: "pending",
      amountCents: 800,
      orderRef: "o1",
      claimedAt: null,
      confirmedAt: null,
    },
  });
  resizeToWebpMock.mockReset().mockResolvedValue({
    blob: new Blob([PHOTO_BYTES], { type: "image/webp" }),
    ext: "webp",
    type: "image/webp",
  });
  notifyVendorTelegramMock.mockReset().mockResolvedValue(undefined);
  notifyPrintkitMock.mockReset().mockResolvedValue(undefined);
});

describe("loadPreClaimContext", () => {
  it("returns order id, amount, and checkout for a valid pending order", async () => {
    ordersMaybeSingle.mockResolvedValueOnce({
      data: { id: "order-1", total_cents: 550, payment_status: "pending" },
    });
    boothsMaybeSingle.mockResolvedValueOnce({
      data: { vendor_id: "vendor-1" },
    });
    createCheckoutMock.mockResolvedValueOnce({
      ok: true,
      data: { type: "qr", transactionId: "tx-1", payload: "paynow-payload" },
    });

    const result = await loadPreClaimContext(BOOTH, TOKEN);

    expect(result).toEqual({
      orderId: "order-1",
      amountCents: 550,
      checkout: {
        type: "qr",
        transactionId: "tx-1",
        payload: "paynow-payload",
      },
    });
    expect(createCheckoutMock).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      amountCents: 550,
      orderRef: "order-1",
    });
  });

  it("returns null for an invalid booth or token", async () => {
    expect(await loadPreClaimContext("not-a-uuid", TOKEN)).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null and never calls paykit's createCheckout when rate-limited", async () => {
    rateLimitMock.mockResolvedValue(false);
    expect(await loadPreClaimContext(BOOTH, TOKEN)).toBeNull();
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      `pre-claim-context:${BOOTH}:${TOKEN}`,
      20,
      60,
    );
  });

  it("returns null when no order matches the booth/token", async () => {
    ordersMaybeSingle.mockResolvedValueOnce({ data: null });
    expect(await loadPreClaimContext(BOOTH, TOKEN)).toBeNull();
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("returns null when the order isn't pending payment", async () => {
    ordersMaybeSingle.mockResolvedValueOnce({
      data: { id: "order-1", total_cents: 550, payment_status: "claimed" },
    });
    expect(await loadPreClaimContext(BOOTH, TOKEN)).toBeNull();
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("returns null when the booth/vendor lookup finds nothing", async () => {
    boothsMaybeSingle.mockResolvedValueOnce({ data: null });
    expect(await loadPreClaimContext(BOOTH, TOKEN)).toBeNull();
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });
});

describe("claimPayment (photo required, deferred numbering)", () => {
  it("rejects a claim with no photo, before creating a client", async () => {
    const result = await claimPayment(BOOTH, TOKEN, null);
    expect(result).toEqual({
      success: false,
      error: "A payment screenshot is required.",
    });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid booth id before creating the client", async () => {
    const result = await claimPayment("not-a-uuid", TOKEN, fakeFile());
    expect(result).toEqual({ success: false, error: "Invalid booth" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid token before creating the client", async () => {
    const result = await claimPayment(BOOTH, "not-a-uuid", fakeFile());
    expect(result).toEqual({ success: false, error: "Invalid order" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("blocks when rate-limited and never uploads or calls paykit", async () => {
    rateLimitMock.mockResolvedValue(false);
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({
      success: false,
      error: "Too many attempts — wait a moment.",
    });
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it("returns 'Invalid order' when the order/token lookup finds nothing", async () => {
    ordersMaybeSingle.mockResolvedValue({ data: null });
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({ success: false, error: "Invalid order" });
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it("rejects a claim on a cancelled order without uploading", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "pending",
        status: "cancelled",
        customer_name: "Ann",
      },
    });
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({
      success: false,
      error: "This order was cancelled.",
    });
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it("rejects a claim on an order that isn't awaiting payment", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "claimed",
        status: "preparing",
        customer_name: "Ann",
      },
    });
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({
      success: false,
      error: "This order isn't awaiting payment.",
    });
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it("returns 'Invalid order' when the booth/vendor lookup finds nothing", async () => {
    boothsMaybeSingle.mockResolvedValue({ data: null });
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({ success: false, error: "Invalid order" });
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it("uploads the photo, claims via paykit, assigns a number, notifies, and updates the mirror", async () => {
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());

    expect(result).toEqual({ success: true, orderNumber: "0007" });
    expect(storageUploadMock).toHaveBeenCalledWith(
      "v1/o1.webp",
      expect.any(ArrayBuffer),
      { upsert: true, contentType: "image/webp" },
    );
    expect(createCheckoutMock).toHaveBeenCalledWith({
      vendorId: "v1",
      amountCents: 800,
      orderRef: "o1",
    });
    expect(claimCheckoutMock).toHaveBeenCalledWith("tx1");
    expect(rpcMock).toHaveBeenCalledWith("assign_order_number", {
      p_order_id: "o1",
    });
    expect(notifyVendorTelegramMock).toHaveBeenCalledWith(BOOTH, "0007");
    expect(notifyPrintkitMock).toHaveBeenCalledWith(BOOTH, "0007");
    expect(update).toHaveBeenCalledWith({
      payment_status: "claimed",
      payment_proof_path: "v1/o1.webp",
      payment_proof_hash: expectedHash(PHOTO_BYTES),
    });
  });

  it("never touches payment state or calls paykit if the upload fails", async () => {
    storageUploadMock.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({
      success: false,
      error: "Could not upload photo. Try again.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalledWith(
      "assign_order_number",
      expect.anything(),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a failure and never assigns a number when paykit checkout creation fails", async () => {
    createCheckoutMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({
      success: false,
      error: "Could not record payment. Try again.",
    });
    expect(claimCheckoutMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("reports a failure and never assigns a number when paykit's claim call fails", async () => {
    claimCheckoutMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({
      success: false,
      error: "Could not record payment. Try again.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("reports a failure and never notifies/mirrors when assign_order_number fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({
      success: false,
      error: "Could not finalize order. Try again.",
    });
    expect(notifyVendorTelegramMock).not.toHaveBeenCalled();
    expect(notifyPrintkitMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("still reports success when the local mirror write fails (paykit already recorded the claim + number)", async () => {
    writeSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await claimPayment(BOOTH, TOKEN, fakeFile());
    expect(result).toEqual({ success: true, orderNumber: "0007" });
  });
});

describe("unclaimPayment", () => {
  beforeEach(() => {
    ordersMaybeSingle.mockReset().mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "claimed",
        status: "preparing",
      },
    });
  });

  it("reverts a claimed order via paykit and mirrors the status locally", async () => {
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(createCheckoutMock).toHaveBeenCalledWith({
      vendorId: "v1",
      amountCents: 800,
      orderRef: "o1",
    });
    expect(unclaimCheckoutMock).toHaveBeenCalledWith("tx1");
    expect(update).toHaveBeenCalledWith({ payment_status: "pending" });
  });

  it("blocks when rate-limited and never calls paykit", async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Too many attempts — wait a moment.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid booth id before creating the client", async () => {
    const res = await unclaimPayment("not-a-uuid", ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns 'Invalid order' when the order/booth lookup finds nothing", async () => {
    ordersMaybeSingle.mockResolvedValue({ data: null });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid order" });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("stays idempotent when already back to pending, without calling paykit", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "pending",
        status: "preparing",
      },
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses to undo a payment the stall already confirmed (local mirror check)", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "confirmed",
        status: "preparing",
      },
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "The stall already confirmed your payment.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses to undo when paykit reports the transaction was confirmed in the meantime", async () => {
    unclaimCheckoutMock.mockResolvedValue({
      ok: true,
      data: {
        transactionId: "tx1",
        status: "confirmed",
        amountCents: 800,
        orderRef: "o1",
        claimedAt: "2026-08-11T00:00:00Z",
        confirmedAt: "2026-08-11T00:05:00Z",
      },
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "The stall already confirmed your payment.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an order that never required payment", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "not_required",
        status: "preparing",
      },
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "This order doesn't take payment.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("reports a failure when paykit checkout lookup fails", async () => {
    createCheckoutMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not undo. Try again.",
    });
    expect(unclaimCheckoutMock).not.toHaveBeenCalled();
  });

  it("reports a failure when paykit's unclaim call fails", async () => {
    unclaimCheckoutMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not undo. Try again.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("still reports success when the local mirror write fails (paykit already recorded the revert)", async () => {
    writeSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
  });
});

describe("getPaymentStatus", () => {
  it("returns null for an invalid token without creating a client", async () => {
    const res = await getPaymentStatus(BOOTH, ORDER, "not-a-uuid");
    expect(res).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null when the token doesn't match any order", async () => {
    ordersMaybeSingle.mockResolvedValue({ data: null });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
  });

  it("returns null and never reads the order when rate-limited", async () => {
    rateLimitMock.mockResolvedValue(false);
    ordersMaybeSingle.mockResolvedValue({
      data: { payment_status: "confirmed" },
    });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      `payment-status:${TOKEN}`,
      30,
      60,
    );
  });

  it("returns the payment status for a matching token", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: { payment_status: "confirmed" },
    });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBe("confirmed");
  });

  it("returns null and logs on a real read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    ordersMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("getPaymentStatus failed", "boom");
    errorSpy.mockRestore();
  });
});
