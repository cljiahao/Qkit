import { describe, it, expect, vi, beforeEach } from "vitest";

const printkitCallbackBearerOkMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();

vi.mock("@/lib/qkit-printkit-auth", () => ({
  printkitCallbackBearerOk: (...args: unknown[]) =>
    printkitCallbackBearerOkMock(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({ update: updateMock }),
    }),
}));

import { POST } from "./route";

function requestWith(body: unknown) {
  return new Request("https://qkit.test/api/printkit/print-status", {
    method: "POST",
    headers: {
      authorization: "Bearer secret",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/printkit/print-status", () => {
  beforeEach(() => {
    printkitCallbackBearerOkMock.mockReset();
    updateMock.mockReset();
    eqMock.mockReset();
    updateMock.mockReturnValue({ eq: eqMock });
    eqMock.mockResolvedValue({ error: null });
  });

  it("returns 401 when the bearer secret doesn't verify", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(false);

    const res = await POST(
      requestWith({ order_id: "order-1", status: "failed" }),
    );

    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid status value", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);

    const res = await POST(
      requestWith({ order_id: "order-1", status: "bogus" }),
    );

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("updates orders.print_status and returns 200", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);

    const res = await POST(
      requestWith({ order_id: "order-1", status: "failed" }),
    );

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ print_status: "failed" }),
    );
    expect(eqMock).toHaveBeenCalledWith("id", "order-1");
  });

  it("returns 503 on a database error", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);
    eqMock.mockResolvedValue({ error: { message: "connection reset" } });

    const res = await POST(
      requestWith({ order_id: "order-1", status: "printed" }),
    );

    expect(res.status).toBe(503);
  });
});
