import { beforeEach, describe, expect, it, vi } from "vitest";
const { client, from, insert } = vi.hoisted(() => ({
  client: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: client }));
import { recordAudit, recordOrderStatusEvent } from "./audit";
beforeEach(() => {
  vi.clearAllMocks();
  client.mockResolvedValue({ from });
  from.mockReturnValue({ insert });
  insert.mockResolvedValue({ error: null });
});
describe.each([
  {
    table: "admin_audit",
    record: () =>
      recordAudit({
        admin_id: "actor",
        action: "confirm_order_payment",
        target_id: "order",
        detail: { amount_cents: 100 },
      }),
  },
  {
    table: "order_status_events",
    record: () =>
      recordOrderStatusEvent({
        order_id: "order",
        from_status: "pending",
        to_status: "preparing",
        actor: "vendor",
      }),
  },
])("$table audit boundary", ({ table, record }) => {
  it("uses the service client and correct append-only table", async () => {
    await expect(record()).resolves.toBeUndefined();
    expect(client).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith(table);
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it("does not fail the completed action when PostgREST rejects the audit write", async () => {
    insert.mockResolvedValue({ error: { message: "Unavailable" } });
    await expect(record()).resolves.toBeUndefined();
  });
  it("does not propagate a network rejection", async () => {
    insert.mockRejectedValue(new Error("Network unavailable"));
    await expect(record()).resolves.toBeUndefined();
  });
  it("does not propagate client initialization failure", async () => {
    client.mockRejectedValue(new Error("Unavailable"));
    await expect(record()).resolves.toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });
});
