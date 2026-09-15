import { describe, expect, it } from "vitest";
import { TOUR_IDS, tourIdSchema } from "./tour-ids";

describe("tourIdSchema", () => {
  it("accepts every known tourId", () => {
    for (const id of TOUR_IDS) {
      expect(tourIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("rejects an arbitrary string, including __proto__", () => {
    for (const bad of ["__proto__", "anything-else", "", "Orders"]) {
      expect(tourIdSchema.safeParse(bad).success).toBe(false);
    }
  });
});
