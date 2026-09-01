import type { MenuItemFormInput } from "./schemas";

// Hand-rolled, not a dependency — 5 fixed columns. No embedded-newline support.

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const CSV_HEADER = "name,description,price,cost,available";

export function menuItemsToCsv(items: MenuItemFormInput[]): string {
  const rows = items.map((it) =>
    [
      csvField(it.name),
      csvField(it.description ?? ""),
      it.price_cents == null ? "" : (it.price_cents / 100).toFixed(2),
      it.cost_cents == null ? "" : (it.cost_cents / 100).toFixed(2),
      it.available ? "true" : "false",
    ].join(","),
  );
  return [CSV_HEADER, ...rows].join("\n");
}

/** Example rows for a vendor with no items yet, showing the expected format. */
export function menuCsvTemplate(): string {
  return [
    CSV_HEADER,
    "Kopi O,Local black coffee,1.80,0.60,true",
    "Roti Prata,,,,true",
  ].join("\n");
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

export interface CsvMenuRow {
  name: string;
  description: string;
  price_cents: number | undefined;
  cost_cents: number | undefined;
  available: boolean;
  error?: string;
}

type DollarField = { cents: number | undefined; error?: string };

/** Blank is valid (no value). Negative or non-numeric is an error. */
function parseDollarField(raw: string, label: string): DollarField {
  const trimmed = raw.trim();
  if (trimmed === "") return { cents: undefined };
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0)
    return { cents: undefined, error: `Invalid ${label} "${trimmed}"` };
  return { cents: Math.round(dollars * 100) };
}

/** First line is always the header, skipped. A bad row gets `error` set,
 * not dropped. */
export function csvToMenuItems(text: string): CsvMenuRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
  const [, ...dataLines] = lines;
  return dataLines.map((line) => {
    const [name = "", description = "", price = "", cost = "", available = ""] =
      parseCsvLine(line);
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const isAvailable = available.trim().toLowerCase() !== "false";

    if (!trimmedName)
      return {
        name: "",
        description: trimmedDescription,
        price_cents: undefined,
        cost_cents: undefined,
        available: true,
        error: "Missing item name",
      };

    const parsedPrice = parseDollarField(price, "price");
    const parsedCost = parseDollarField(cost, "cost");
    const error = parsedPrice.error ?? parsedCost.error;

    return {
      name: trimmedName,
      description: trimmedDescription,
      price_cents: parsedPrice.cents,
      cost_cents: parsedCost.cents,
      available: isAvailable,
      ...(error ? { error } : {}),
    };
  });
}
