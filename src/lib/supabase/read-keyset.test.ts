import { describe, expect, it } from "vitest";
import { readKeysetRows } from "./read-keyset";

describe("readKeysetRows", () => {
  it("keeps the next order when an earlier order completes between capped pages", async () => {
    let queue = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const cursors: (string | null)[] = [];
    const rows = await readKeysetRows(async (afterId) => {
      cursors.push(afterId);
      if (afterId === "b") queue = queue.filter((row) => row.id !== "a");
      return {
        data: queue
          .filter((row) => afterId === null || row.id > afterId)
          .slice(0, 2),
        error: null,
      };
    });
    expect(rows).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(cursors).toEqual([null, "b", "c"]);
  });

  it("rejects a late failure instead of returning a partial queue", async () => {
    await expect(
      readKeysetRows(async (afterId) =>
        afterId === null
          ? { data: [{ id: "a" }], error: null }
          : { data: null, error: { message: "offline" } },
      ),
    ).rejects.toThrow("Could not load complete queue");
  });

  it("rejects null results and nonadvancing cursors", async () => {
    await expect(
      readKeysetRows(async () => ({ data: null, error: null })),
    ).rejects.toThrow("Could not load complete queue");
    await expect(
      readKeysetRows(async () => ({ data: [{ id: "a" }], error: null })),
    ).rejects.toThrow("Queue cursor did not advance");
  });
});
