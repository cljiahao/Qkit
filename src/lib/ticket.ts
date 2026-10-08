import type { OrderStatus, PaymentStatus } from "./types";

/**
 * What the order ticket prints for one selected option: the vendor's own short
 * code when they have set one ("LS" for "Less sugar"), otherwise the choice as
 * written.
 *
 * Codes are the vendor's shorthand, never derived automatically. An initial
 * taken from the label collides too easily ("Soy" and "Skim", "Hot" and "Half
 * sugar") and a wrong drink costs more than the space saved, so an unset code
 * falls back to the full choice rather than a guess.
 */
export type OptionCodes = Record<string, string>;

const KEY_SEPARATOR = "\u0000";

/** Longest short code a choice may carry. Past this it is no longer short. */
export const OPTION_CODE_MAX = 6;

export function optionCodeKey(
  menuItemId: string,
  group: string,
  choice: string,
): string {
  return [menuItemId, group, choice].join(KEY_SEPARATOR);
}

type MenuItemForCodes = {
  id: string;
  option_groups?:
    | {
        label: string;
        choices: { label: string; code?: string | null }[];
      }[]
    | null;
};

/**
 * Every short code in a booth's menu, keyed by item, group and choice label.
 * Keyed on labels because an order stores the labels the customer picked, not
 * choice ids, and on the item because two items can reuse a group name with
 * different shorthand.
 */
export function buildOptionCodes(menuItems: MenuItemForCodes[]): OptionCodes {
  const codes: OptionCodes = {};
  for (const item of menuItems) {
    for (const group of item.option_groups ?? []) {
      for (const choice of group.choices) {
        const code = choice.code?.trim();
        if (code)
          codes[optionCodeKey(item.id, group.label, choice.label)] = code;
      }
    }
  }
  return codes;
}

type TicketItem = {
  menuItemId: string;
  options?: { group: string; choice: string }[] | null;
};

/**
 * The options of one ordered item as the ticket shows them, in order. When two
 * of them would print the same text ("Normal" sugar and "Normal" ice), each is
 * prefixed with its group so staff are never left guessing which is which.
 */
export function ticketOptions(
  item: TicketItem,
  codes: OptionCodes = {},
): string[] {
  const options = item.options ?? [];
  const shown = options.map(
    (o) => codes[optionCodeKey(item.menuItemId, o.group, o.choice)] ?? o.choice,
  );
  const seen = new Map<string, number>();
  for (const text of shown) seen.set(text, (seen.get(text) ?? 0) + 1);
  return options.map((o, i) =>
    (seen.get(shown[i]) ?? 0) > 1 ? `${o.group} ${shown[i]}` : shown[i],
  );
}

/**
 * A starting point for a choice's short code, offered as the field's
 * placeholder and never applied by itself: the initial of each word, with a
 * number kept whole ("Less sugar" gives "LS", "25 percent" gives "25").
 */
export function suggestOptionCode(label: string): string {
  const words = label.match(/[\p{L}\p{N}]+/gu) ?? [];
  const numeric = words.find((w) => /^\p{N}+$/u.test(w));
  if (numeric) return numeric.slice(0, OPTION_CODE_MAX);
  return words
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, OPTION_CODE_MAX);
}

export type TicketAttention = {
  kind: "payment_claimed" | "print_failed" | "overtaken" | "unpaid";
  label: string;
  /** "action" needs the vendor to do something; "notice" is worth a look. */
  tone: "action" | "notice";
};

/**
 * The one thing on a ticket that needs a second look, or null. A ticket used to
 * stack a badge for each of these, and at a counter that reads as noise: five
 * small pills are five things to parse before finding the drink. Ranked so the
 * slot always carries whichever costs the most if missed: money to check, a
 * cup with no label, an order nobody marked, then a payment not made yet.
 */
export function ticketAttention({
  status,
  paymentStatus,
  printStatus,
  overtaken,
}: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  printStatus: string | null;
  overtaken: boolean;
}): TicketAttention | null {
  if (status === "completed" || status === "cancelled") return null;
  if (paymentStatus === "claimed")
    return {
      kind: "payment_claimed",
      label: "Says paid. Check the payment",
      tone: "action",
    };
  if (printStatus === "failed")
    return {
      kind: "print_failed",
      label: "Label did not print",
      tone: "notice",
    };
  if (overtaken)
    return {
      kind: "overtaken",
      label: "A later order is already out",
      tone: "notice",
    };
  if (paymentStatus === "pending")
    return { kind: "unpaid", label: "Not paid yet", tone: "notice" };
  return null;
}
