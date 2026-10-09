import { describe, expect, it, vi } from "vitest";
import { findAuthUserByEmail, listAllAuthUsers } from "./auth";

describe("listAllAuthUsers", () => {
  it("finds a vendor after the first full auth page", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `first-${index}`,
      email: `first-${index}@example.com`,
    }));
    const laterUser = { id: "later", email: "later@example.com" };
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: firstPage }, error: null })
      .mockResolvedValueOnce({ data: { users: [laterUser] }, error: null });
    const client = { auth: { admin: { listUsers } } } as unknown as Parameters<
      typeof listAllAuthUsers
    >[0];

    const result = await listAllAuthUsers(client, "test");

    expect(result.error).toBeNull();
    expect(
      findAuthUserByEmail(result.data?.users ?? [], "LATER@example.com"),
    ).toEqual(laterUser);
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });
  });

  it("surfaces a later-page error rather than returning an incomplete user list", async () => {
    const failure = { message: "auth unavailable" };
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({
        data: { users: Array.from({ length: 1000 }, () => ({ id: "first" })) },
        error: null,
      })
      .mockResolvedValueOnce({ data: { users: [] }, error: failure });
    const client = { auth: { admin: { listUsers } } } as unknown as Parameters<
      typeof listAllAuthUsers
    >[0];
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await listAllAuthUsers(client, "test");
      expect(result.error).toEqual(failure);
      expect(result.data?.users).toEqual([]);
    } finally {
      logger.mockRestore();
    }
  });
});
