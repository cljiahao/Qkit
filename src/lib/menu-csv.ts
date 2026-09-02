import type { MenuItemFormInput } from "./schemas";
import type { OptionGroup } from "./types";

// Hand-rolled, not a dependency. No embedded-newline support.

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const CSV_HEADER =
  "name,description,price,cost,available,group_name,group_type,choice_label,choice_price";

function itemRowToCsv(it: MenuItemFormInput): string {
  return [
    csvField(it.name),
    csvField(it.description ?? ""),
    it.price_cents == null ? "" : (it.price_cents / 100).toFixed(2),
    it.cost_cents == null ? "" : (it.cost_cents / 100).toFixed(2),
    it.available ? "true" : "false",
    "",
    "",
    "",
    "",
  ].join(",");
}

function choiceRowToCsv(
  group: OptionGroup,
  choice: OptionGroup["choices"][number],
): string {
  return [
    "",
    "",
    "",
    "",
    "",
    csvField(group.label),
    group.multiple ? "any" : "one",
    csvField(choice.label),
    choice.price_delta_cents == null
      ? ""
      : (choice.price_delta_cents / 100).toFixed(2),
  ].join(",");
}

export function menuItemsToCsv(items: MenuItemFormInput[]): string {
  const rows: string[] = [];
  for (const it of items) {
    rows.push(itemRowToCsv(it));
    for (const group of it.option_groups ?? []) {
      for (const choice of group.choices)
        rows.push(choiceRowToCsv(group, choice));
    }
  }
  return [CSV_HEADER, ...rows].join("\n");
}

/** Example rows for a vendor with no items yet, showing the expected format. */
export function menuCsvTemplate(): string {
  return [
    CSV_HEADER,
    "Kopi O,Local black coffee,1.80,0.60,true,,,,",
    "Roti Prata,,,,true,,,,",
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

export interface CsvChoiceRow {
  groupName: string;
  groupType: "one" | "any";
  choiceLabel: string;
  choicePrice_cents: number | undefined;
  error?: string;
}

export interface CsvMenuRow {
  name: string;
  description: string;
  price_cents: number | undefined;
  cost_cents: number | undefined;
  available: boolean;
  choices: CsvChoiceRow[];
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

interface ParsedRowFields {
  name: string;
  description: string;
  price: string;
  cost: string;
  available: string;
  groupName: string;
  groupType: string;
  choiceLabel: string;
  choicePrice: string;
}

function parseRowFields(line: string): ParsedRowFields {
  const [
    name = "",
    description = "",
    price = "",
    cost = "",
    available = "",
    groupName = "",
    groupType = "",
    choiceLabel = "",
    choicePrice = "",
  ] = parseCsvLine(line);
  return {
    name,
    description,
    price,
    cost,
    available,
    groupName,
    groupType,
    choiceLabel,
    choicePrice,
  };
}

function parseItemRow(fields: ParsedRowFields, rowNumber: number): CsvMenuRow {
  const parsedPrice = parseDollarField(fields.price, "price");
  const parsedCost = parseDollarField(fields.cost, "cost");
  const error = parsedPrice.error ?? parsedCost.error;
  return {
    name: fields.name.trim(),
    description: fields.description.trim(),
    price_cents: parsedPrice.cents,
    cost_cents: parsedCost.cents,
    available: fields.available.trim().toLowerCase() !== "false",
    choices: [],
    ...(error ? { error: `Row ${rowNumber}: ${error}` } : {}),
  };
}

function parseChoiceRow(
  fields: ParsedRowFields,
  rowNumber: number,
): CsvChoiceRow {
  const groupName = fields.groupName.trim();
  const choiceLabel = fields.choiceLabel.trim();
  const groupType =
    fields.groupType.trim().toLowerCase() === "any" ? "any" : "one";
  if (!groupName || !choiceLabel) {
    return {
      groupName,
      groupType,
      choiceLabel,
      choicePrice_cents: undefined,
      error: `Row ${rowNumber}: choice needs both a group name and a choice label`,
    };
  }
  const parsedChoicePrice = parseDollarField(
    fields.choicePrice,
    "choice price",
  );
  return {
    groupName,
    groupType,
    choiceLabel,
    choicePrice_cents: parsedChoicePrice.cents,
    ...(parsedChoicePrice.error
      ? { error: `Row ${rowNumber}: ${parsedChoicePrice.error}` }
      : {}),
  };
}

function emptyErrorRow(rowNumber: number, message: string): CsvMenuRow {
  return {
    name: "",
    description: "",
    price_cents: undefined,
    cost_cents: undefined,
    available: true,
    choices: [],
    error: `Row ${rowNumber}: ${message}`,
  };
}

/**
 * A row with `name` filled is an item row. A row with `name` blank and
 * `group_name`/`choice_label` filled is a choice row, attached to the item
 * row immediately above it (continuation rows) — see the design doc,
 * `docs/superpowers/specs/2026-09-01-menu-csv-customization-design.md`.
 * The first line is always the header, skipped. Every error names its real
 * spreadsheet row (header = row 1), so a bad row never disappears silently.
 */
export function csvToMenuItems(text: string): CsvMenuRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
  const [, ...dataLines] = lines;

  const items: CsvMenuRow[] = [];
  let current: CsvMenuRow | null = null;

  dataLines.forEach((line, i) => {
    const rowNumber = i + 2;
    const fields = parseRowFields(line);

    if (fields.name.trim()) {
      current = parseItemRow(fields, rowNumber);
      items.push(current);
      return;
    }

    if (!fields.groupName.trim() && !fields.choiceLabel.trim()) {
      items.push(emptyErrorRow(rowNumber, "Missing item name"));
      current = null;
      return;
    }

    if (!current) {
      items.push(
        emptyErrorRow(rowNumber, "customization row has no item above it"),
      );
      return;
    }

    current.choices.push(parseChoiceRow(fields, rowNumber));
  });

  return items;
}

/**
 * Consecutive choice rows sharing a `groupName` become one group, in file
 * order. Only valid (non-`error`) choices are used — call with `choices`
 * already known to contain at least one valid entry (`commitImport` only
 * replaces `option_groups` in that case; see the design doc).
 */
export function optionGroupsFromCsvChoices(
  choices: CsvChoiceRow[],
): OptionGroup[] {
  const groups: OptionGroup[] = [];
  let current: OptionGroup | null = null;
  for (const c of choices) {
    if (c.error) continue;
    if (!current || current.label !== c.groupName) {
      current = {
        id: crypto.randomUUID(),
        label: c.groupName,
        multiple: c.groupType === "any",
        choices: [],
      };
      groups.push(current);
    }
    current.choices.push({
      id: crypto.randomUUID(),
      label: c.choiceLabel,
      ...(c.choicePrice_cents != null
        ? { price_delta_cents: c.choicePrice_cents }
        : {}),
    });
  }
  return groups;
}
