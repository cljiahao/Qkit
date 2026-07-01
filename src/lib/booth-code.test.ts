import { describe, it, expect } from "vitest";
import { orderPath } from "./booth-code";

describe("orderPath", () => {
  it("builds the short /o/ entry URL", () => {
    expect(orderPath("Ab3xZ9qK2mNp")).toBe("/o/Ab3xZ9qK2mNp");
  });
  it("url-encodes the code defensively", () => {
    expect(orderPath("a b")).toBe("/o/a%20b");
  });
});
