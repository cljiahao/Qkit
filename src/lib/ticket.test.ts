import { describe, expect, it } from "vitest";
import {
  buildOptionCodes,
  optionCodeKey,
  suggestOptionCode,
  ticketAttention,
  ticketOptions,
} from "./ticket";

const MENU = [
  {
    id: "kopi",
    option_groups: [
      {
        label: "Sugar",
        choices: [
          { label: "Normal" },
          { label: "Less sugar", code: "LS" },
          { label: "No sugar", code: " NS " },
        ],
      },
      {
        label: "Ice",
        choices: [{ label: "Normal" }, { label: "Less ice", code: "" }],
      },
    ],
  },
  { id: "milo", option_groups: null },
  { id: "teh" },
];

describe("buildOptionCodes", () => {
  it("collects only the choices that carry a code, trimmed", () => {
    expect(buildOptionCodes(MENU)).toEqual({
      [optionCodeKey("kopi", "Sugar", "Less sugar")]: "LS",
      [optionCodeKey("kopi", "Sugar", "No sugar")]: "NS",
    });
  });

  it("keeps two items apart even when they reuse a group and choice", () => {
    const codes = buildOptionCodes([
      {
        id: "a",
        option_groups: [
          { label: "Size", choices: [{ label: "Large", code: "L" }] },
        ],
      },
      {
        id: "b",
        option_groups: [
          { label: "Size", choices: [{ label: "Large", code: "XL" }] },
        ],
      },
    ]);
    expect(codes[optionCodeKey("a", "Size", "Large")]).toBe("L");
    expect(codes[optionCodeKey("b", "Size", "Large")]).toBe("XL");
  });
});

describe("ticketOptions", () => {
  const codes = buildOptionCodes(MENU);

  it("prints the vendor's code where one is set and the choice in full where not", () => {
    expect(
      ticketOptions(
        {
          menuItemId: "kopi",
          options: [
            { group: "Sugar", choice: "Less sugar" },
            { group: "Ice", choice: "Less ice" },
          ],
        },
        codes,
      ),
    ).toEqual(["LS", "Less ice"]);
  });

  it("names the group when two options would print the same text", () => {
    expect(
      ticketOptions(
        {
          menuItemId: "kopi",
          options: [
            { group: "Sugar", choice: "Normal" },
            { group: "Ice", choice: "Normal" },
          ],
        },
        codes,
      ),
    ).toEqual(["Sugar Normal", "Ice Normal"]);
  });

  it("prints choices in full with no codes at all", () => {
    expect(
      ticketOptions({
        menuItemId: "kopi",
        options: [{ group: "Sugar", choice: "Less sugar" }],
      }),
    ).toEqual(["Less sugar"]);
  });

  it("is empty for an item with no options", () => {
    expect(ticketOptions({ menuItemId: "milo" }, codes)).toEqual([]);
    expect(ticketOptions({ menuItemId: "milo", options: null })).toEqual([]);
  });
});

describe("suggestOptionCode", () => {
  it("takes the initial of each word", () => {
    expect(suggestOptionCode("Less sugar")).toBe("LS");
    expect(suggestOptionCode("Hot")).toBe("H");
    expect(suggestOptionCode("oat milk")).toBe("OM");
  });

  it("keeps a number whole, since the number is the point", () => {
    expect(suggestOptionCode("25 percent")).toBe("25");
    expect(suggestOptionCode("Sugar 50%")).toBe("50");
  });

  it("ignores punctuation and never runs past the code limit", () => {
    expect(suggestOptionCode("O (black)")).toBe("OB");
    expect(suggestOptionCode("a b c d e f g h")).toBe("ABCDEF");
    expect(suggestOptionCode("   ")).toBe("");
  });
});

describe("ticketAttention", () => {
  const live = {
    status: "preparing" as const,
    paymentStatus: "not_required" as const,
    printStatus: "printed",
    overtaken: false,
  };

  it("is quiet for an ordinary ticket", () => {
    expect(ticketAttention(live)).toBeNull();
    expect(ticketAttention({ ...live, paymentStatus: "confirmed" })).toBeNull();
  });

  it("puts a payment to check above everything else", () => {
    expect(
      ticketAttention({
        ...live,
        paymentStatus: "claimed",
        printStatus: "failed",
        overtaken: true,
      })?.kind,
    ).toBe("payment_claimed");
  });

  it("ranks a failed label above an order nobody marked", () => {
    expect(
      ticketAttention({ ...live, printStatus: "failed", overtaken: true })
        ?.kind,
    ).toBe("print_failed");
  });

  it("ranks an order nobody marked above a payment not made yet", () => {
    expect(
      ticketAttention({ ...live, overtaken: true, paymentStatus: "pending" })
        ?.kind,
    ).toBe("overtaken");
    expect(ticketAttention({ ...live, paymentStatus: "pending" })?.kind).toBe(
      "unpaid",
    );
  });

  it("says nothing once the order is over", () => {
    for (const status of ["completed", "cancelled"] as const) {
      expect(
        ticketAttention({
          ...live,
          status,
          paymentStatus: "claimed",
          printStatus: "failed",
          overtaken: true,
        }),
      ).toBeNull();
    }
  });
});
