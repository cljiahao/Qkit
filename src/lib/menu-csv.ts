import type { MenuItemFormInput } from "./schemas";

// Hand-rolled rather than a dependency — the shape is 4 fixed columns.
// Handles quoted fields with embedded commas/quotes; does not handle a
// literal newline inside a quoted field (row-per-line parsing).

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const CSV_HEADER = "name,description,price,available";

export function menuItemsToCsv(items: MenuItemFormInput[]): string {
  const rows = items.map((it) =>
    [
      csvField(it.name),
      csvField(it.description ?? ""),
      it.price_cents == null ? "" : (it.price_cents / 100).toFixed(2),
      it.available ? "true" : "false",
    ].join(","),
  );
  return [CSV_HEADER, ...rows].join("\n");
}

/** Blank starting point for a vendor with no items yet — same shape
 * menuItemsToCsv writes, with two example rows showing the expected format
 * (including a blank price, since price is optional). */
export function menuCsvTemplate(): string {
  return [
    CSV_HEADER,
    "Kopi O,Local black coffee,1.80,true",
    "Roti Prata,,,true",
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
  available: boolean;
  error?: string;
}

/** Parses the same `name,description,price,available` shape menuItemsToCsv
 * writes. The first non-empty line is always treated as the header and
 * skipped. A row with no name, or an unparseable price, comes back with
 * `error` set instead of being dropped — the import preview surfaces it. */
export function csvToMenuItems(text: string): CsvMenuRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
  const [, ...dataLines] = lines;
  return dataLines.map((line) => {
    const [name = "", description = "", price = "", available = ""] =
      parseCsvLine(line);
    const trimmedName = name.trim();
    if (!trimmedName)
      return {
        name: "",
        description: description.trim(),
        price_cents: undefined,
        available: true,
        error: "Missing item name",
      };

    const trimmedPrice = price.trim();
    if (trimmedPrice === "")
      return {
        name: trimmedName,
        description: description.trim(),
        price_cents: undefined,
        available: available.trim().toLowerCase() !== "false",
      };

    const dollars = Number(trimmedPrice);
    if (!Number.isFinite(dollars) || dollars < 0)
      return {
        name: trimmedName,
        description: description.trim(),
        price_cents: undefined,
        available: available.trim().toLowerCase() !== "false",
        error: `Invalid price "${price.trim()}"`,
      };

    return {
      name: trimmedName,
      description: description.trim(),
      price_cents: Math.round(dollars * 100),
      available: available.trim().toLowerCase() !== "false",
    };
  });
}
