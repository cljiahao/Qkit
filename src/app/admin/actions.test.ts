import { describe, expect, it, vi, beforeEach } from "vitest";
import { setVendorPlan, grantPass } from "./actions";

// Mock the SERVICE client's fluent chains + the admin gate. `from(table)`
// dispatches per table so we can drive each terminal independently and count
// the ledger (`payments`) inserts:
//   vendors  — read  : select→eq→maybeSingle (current plan)
//            — write : update→eq→select→maybeSingle (updated row)
//   licenses — insert→select→single (new pass, returns its id)
//   payments — insert (awaited terminal → { error })
//   admin_audit      — insert (awaited terminal → { error })
//   purchase_requests— update→eq→eq (awaited terminal → { error })
const {
  requireAdminMock,
  vendorsReadSingle,
  vendorsUpdate,
  vendorsUpdateSingle,
  paymentsInsert,
  licensesInsert,
  licensesSingle,
  auditInsert,
  purchaseReqEq,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  vendorsReadSingle: vi.fn(),
  vendorsUpdate: vi.fn(),
  vendorsUpdateSingle: vi.fn(),
  paymentsInsert: vi.fn(),
  licensesInsert: vi.fn(),
  licensesSingle: vi.fn(),
  auditInsert: vi.fn(),
  purchaseReqEq: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: requireAdminMock }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: (table: string) => {
        switch (table) {
          case "vendors":
            return {
              select: () => ({
                eq: () => ({ maybeSingle: vendorsReadSingle }),
              }),
              update: (...args: unknown[]) => {
                vendorsUpdate(...args);
                return {
                  eq: () => ({
                    select: () => ({ maybeSingle: vendorsUpdateSingle }),
                  }),
                };
              },
            };
          case "licenses":
            return {
              insert: (...args: unknown[]) => {
                licensesInsert(...args);
                return { select: () => ({ single: licensesSingle }) };
              },
            };
          case "payments":
            return { insert: paymentsInsert };
          case "admin_audit":
            return { insert: auditInsert };
          case "purchase_requests":
            return { update: () => ({ eq: () => ({ eq: purchaseReqEq }) }) };
          default:
            throw new Error(`unexpected table ${table}`);
        }
      },
    }),
}));

const VENDOR = "00000000-0000-4000-8000-000000000001";
const LICENSE = "00000000-0000-4000-8000-0000000000aa";
const ADMIN = "admin-1";

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue({ user: { id: ADMIN } });
  vendorsReadSingle.mockReset().mockResolvedValue({ data: { plan: "free" } });
  vendorsUpdate.mockReset();
  vendorsUpdateSingle
    .mockReset()
    .mockResolvedValue({ data: { id: VENDOR }, error: null });
  paymentsInsert.mockReset().mockResolvedValue({ error: null });
  licensesInsert.mockReset();
  licensesSingle
    .mockReset()
    .mockResolvedValue({ data: { id: LICENSE }, error: null });
  auditInsert.mockReset().mockResolvedValue({ error: null });
  purchaseReqEq.mockReset().mockResolvedValue({ error: null });
});

describe("setVendorPlan", () => {
  it("free→pro with amount>0 records exactly one subscription payment", async () => {
    vendorsReadSingle.mockResolvedValue({ data: { plan: "free" } });
    const res = await setVendorPlan({
      vendorId: VENDOR,
      plan: "pro",
      amountCents: 1500,
      note: "market day",
    });
    expect(res).toEqual({ success: true });
    expect(vendorsUpdate).toHaveBeenCalledWith({ plan: "pro" });
    expect(paymentsInsert).toHaveBeenCalledTimes(1);
    expect(paymentsInsert).toHaveBeenCalledWith({
      vendor_id: VENDOR,
      kind: "subscription",
      amount_cents: 1500,
      source: "paynow",
      note: "market day",
    });
  });

  it("re-submitting an already-pro vendor records no second payment", async () => {
    vendorsReadSingle.mockResolvedValue({ data: { plan: "pro" } });
    const res = await setVendorPlan({
      vendorId: VENDOR,
      plan: "pro",
      amountCents: 1500,
    });
    expect(res).toEqual({ success: true });
    expect(paymentsInsert).not.toHaveBeenCalled();
  });

  it("surfaces a failed ledger insert while plan + audit still land", async () => {
    vendorsReadSingle.mockResolvedValue({ data: { plan: "free" } });
    paymentsInsert.mockResolvedValue({ error: { message: "boom" } });
    const res = await setVendorPlan({
      vendorId: VENDOR,
      plan: "pro",
      amountCents: 1500,
    });
    expect(res).toEqual({
      success: false,
      error:
        "Plan updated, but recording the payment failed — add it to the ledger manually.",
    });
    // The plan update and the audit row still landed.
    expect(vendorsUpdate).toHaveBeenCalledWith({ plan: "pro" });
    expect(auditInsert).toHaveBeenCalledTimes(1);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: ADMIN,
        action: "set_plan",
        target_id: VENDOR,
      }),
    );
  });
});

describe("grantPass", () => {
  it("a comp (amountCents=0) mints the license but records no payment", async () => {
    const res = await grantPass({
      vendorId: VENDOR,
      days: 1,
      amountCents: 0,
    });
    expect(res).toEqual({ success: true });
    expect(licensesInsert).toHaveBeenCalledTimes(1);
    expect(paymentsInsert).not.toHaveBeenCalled();
  });

  it("a paid pass records the payment keyed to the new license id", async () => {
    const res = await grantPass({
      vendorId: VENDOR,
      days: 3,
      amountCents: 2000,
      note: "cash at booth",
    });
    expect(res).toEqual({ success: true });
    expect(licensesInsert).toHaveBeenCalledTimes(1);
    expect(paymentsInsert).toHaveBeenCalledTimes(1);
    expect(paymentsInsert).toHaveBeenCalledWith({
      vendor_id: VENDOR,
      kind: "pass",
      amount_cents: 2000,
      source: "paynow",
      note: "cash at booth",
      license_id: LICENSE,
    });
  });
});
