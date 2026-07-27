import { describe, it, expect, beforeEach } from "vitest";
import { provisionBearerOk } from "@/lib/merqo-auth";

function req(auth?: string) {
  return new Request("http://localhost/api/merqo/vendor-provision", {
    headers: auth ? { Authorization: auth } : {},
  });
}

describe("provisionBearerOk", () => {
  beforeEach(() => {
    process.env.MERQO_PROVISION_SECRET = "provision-secret";
    process.env.MERQO_METRICS_SECRET = "metrics-secret";
  });

  it("true on the correct provision secret", () => {
    expect(provisionBearerOk(req("Bearer provision-secret"))).toBe(true);
  });

  it("false when the bearer is missing", () => {
    expect(provisionBearerOk(req())).toBe(false);
  });

  it("false when the METRICS secret is sent instead — the two must not be interchangeable", () => {
    expect(provisionBearerOk(req("Bearer metrics-secret"))).toBe(false);
  });

  it("false when MERQO_PROVISION_SECRET is unset", () => {
    delete process.env.MERQO_PROVISION_SECRET;
    expect(provisionBearerOk(req("Bearer provision-secret"))).toBe(false);
  });
});
