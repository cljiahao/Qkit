import { beforeEach, describe, expect, it, vi } from "vitest";

const { allowed, auth, users, from, insert, update, filters, responses } =
  vi.hoisted(() => ({
    allowed: vi.fn(),
    auth: vi.fn(),
    users: vi.fn(),
    from: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    filters: vi.fn(),
    responses: [] as { data?: unknown; error?: { message: string } | null }[],
  }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({ from }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: allowed,
  clientIp: () => "test-ip",
}));
vi.mock("@/lib/merqo-auth", async (original) => ({
  ...(await original<typeof import("@/lib/merqo-auth")>()),
  bearerOk: auth,
  listAllAuthUsers: users,
}));
import { POST as upgrade } from "@/app/api/merqo/upgrade-request/route";
import { POST as downgrade } from "@/app/api/merqo/downgrade-request/route";

function request(body = JSON.stringify({ email: "vendor@example.com" })) {
  return new Request("https://qkit.example/api/merqo/plan", {
    method: "POST",
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  allowed.mockResolvedValue(true);
  auth.mockReturnValue(true);
  users.mockResolvedValue({
    data: { users: [{ id: "vendor-1", email: "vendor@example.com" }] },
    error: null,
  });
  responses.length = 0;
  from.mockImplementation((table: string) => {
    const result = responses.shift() ?? { data: null, error: null };
    const chain = {
      select: vi.fn(() => chain),
      eq: (column: string, value: unknown) => {
        filters(table, column, value);
        return chain;
      },
      limit: vi.fn(() => chain),
      maybeSingle: async () => result,
      insert: (value: unknown) => {
        insert(table, value);
        return chain;
      },
      update: (value: unknown) => {
        update(table, value);
        return chain;
      },
      then: <T>(resolve: (value: typeof result) => T) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  });
});

describe.each([
  ["upgrade", upgrade],
  ["downgrade", downgrade],
] as const)("Merqo %s boundary", (_name, handler) => {
  it("rejects unauthorized requests before service queries", async () => {
    auth.mockReturnValue(false);
    expect((await handler(request())).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(users).not.toHaveBeenCalled();
  });
  it("honors the mutation flood guard", async () => {
    allowed.mockResolvedValue(false);
    expect((await handler(request())).status).toBe(429);
    expect(users).not.toHaveBeenCalled();
  });
  it.each([
    "{invalid",
    JSON.stringify({ email: "invalid" }),
    JSON.stringify({}),
  ])("rejects malformed input %s", async (body) => {
    expect((await handler(request(body))).status).toBe(400);
    expect(users).not.toHaveBeenCalled();
  });
  it("distinguishes auth directory failure from unknown user", async () => {
    users.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect((await handler(request())).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
  });
  it("does not query vendor data for an unknown auth email", async () => {
    users.mockResolvedValue({ data: { users: [] }, error: null });
    expect((await handler(request())).status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });
  it("returns503 for vendor lookup failure", async () => {
    responses.push({ data: null, error: { message: "offline" } });
    expect((await handler(request())).status).toBe(503);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("does not mutate for an auth user without a vendor row", async () => {
    responses.push({ data: null, error: null });
    expect((await handler(request())).status).toBe(404);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("upgrade request writes", () => {
  it("creates only a monthly request for the matched vendor", async () => {
    responses.push(
      { data: { id: "vendor-1" } },
      { data: null },
      { error: null },
    );
    expect((await upgrade(request())).status).toBe(200);
    expect(insert).toHaveBeenCalledWith("purchase_requests", {
      vendor_id: "vendor-1",
      kind: "monthly",
    });
    expect(filters).toHaveBeenCalledWith(
      "purchase_requests",
      "status",
      "pending",
    );
  });
  it("replays pending requests without a duplicate write", async () => {
    responses.push({ data: { id: "vendor-1" } }, { data: { id: "existing" } });
    expect((await upgrade(request())).status).toBe(200);
    expect(insert).not.toHaveBeenCalled();
  });
  it("does not insert when checking existing requests fails", async () => {
    responses.push(
      { data: { id: "vendor-1" } },
      { error: { message: "offline" } },
    );
    expect((await upgrade(request())).status).toBe(503);
    expect(insert).not.toHaveBeenCalled();
  });
  it("reports failed insertion", async () => {
    responses.push(
      { data: { id: "vendor-1" } },
      { data: null },
      { error: { message: "offline" } },
    );
    expect((await upgrade(request())).status).toBe(503);
  });
});

describe("downgrade writes", () => {
  it("does not write for an already-free vendor", async () => {
    responses.push({ data: { id: "vendor-1", plan: "free" } });
    expect((await downgrade(request())).status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });
  it("downgrades the matched vendor and clears only pending monthly requests", async () => {
    responses.push(
      { data: { id: "vendor-1", plan: "pro" } },
      { error: null },
      { error: null },
    );
    expect((await downgrade(request())).status).toBe(200);
    expect(update).toHaveBeenCalledWith("vendors", { plan: "free" });
    expect(filters).toHaveBeenCalledWith("vendors", "id", "vendor-1");
    expect(filters).toHaveBeenCalledWith(
      "purchase_requests",
      "vendor_id",
      "vendor-1",
    );
    expect(filters).toHaveBeenCalledWith(
      "purchase_requests",
      "kind",
      "monthly",
    );
    expect(filters).toHaveBeenCalledWith(
      "purchase_requests",
      "status",
      "pending",
    );
  });
  it("does not clear requests if updating the vendor fails", async () => {
    responses.push(
      { data: { id: "vendor-1", plan: "pro" } },
      { error: { message: "offline" } },
    );
    expect((await downgrade(request())).status).toBe(503);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it("preserves a successful downgrade despite cleanup failure", async () => {
    responses.push(
      { data: { id: "vendor-1", plan: "pro" } },
      { error: null },
      { error: { message: "offline" } },
    );
    expect((await downgrade(request())).status).toBe(200);
    expect(update).toHaveBeenCalledTimes(2);
  });
});
