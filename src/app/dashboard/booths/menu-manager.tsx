"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload } from "lucide-react";
import { InfoTooltip } from "@merqo/ui";
import { Button } from "@/components/ui/button";
import { useAsyncAction, navigatingAway } from "@/hooks/use-async-action";
import { MenuEditor } from "./menu-editor";
import { saveMenuItems } from "./actions";
import { sanitizeOptionGroups, type MenuItemFormInput } from "@/lib/schemas";
import {
  menuItemsToCsv,
  menuCsvTemplate,
  csvToMenuItems,
  optionGroupsFromCsvChoices,
  type CsvMenuRow,
  type CsvChoiceRow,
} from "@/lib/menu-csv";
import type { Entitlement } from "@/lib/plan";

interface Props {
  vendorId: string;
  boothId: string;
  boothName: string;
  entitlement: Entitlement;
  initialItems: MenuItemFormInput[];
}

function formatImportRow(row: CsvMenuRow): string {
  if (row.error) return row.error;
  const parts = [row.name];
  if (row.description) parts.push(`(${row.description})`);
  if (row.price_cents != null)
    parts.push(`$${(row.price_cents / 100).toFixed(2)}`);
  if (row.cost_cents != null)
    parts.push(`(cost $${(row.cost_cents / 100).toFixed(2)})`);
  return parts.join(" ");
}

function formatChoiceRow(choice: CsvChoiceRow): string {
  if (choice.error) return choice.error;
  const parts = [`${choice.groupName}: ${choice.choiceLabel}`];
  if (choice.groupType === "any") parts.push("(pick any)");
  if (choice.choicePrice_cents != null)
    parts.push(`+$${(choice.choicePrice_cents / 100).toFixed(2)}`);
  return parts.join(" ");
}

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MenuManager({
  vendorId,
  boothId,
  boothName,
  entitlement,
  initialItems,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<MenuItemFormInput[]>(initialItems);
  const [importPreview, setImportPreview] = useState<CsvMenuRow[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pending: saving, run: runSave } = useAsyncAction();

  function onExport() {
    const csv = items.length === 0 ? menuCsvTemplate() : menuItemsToCsv(items);
    const safeName = boothName.trim().replace(/[^\w-]+/g, "-") || "menu";
    const suffix = items.length === 0 ? "menu-template" : "menu";
    downloadCsv(`${safeName}-${suffix}.csv`, csv);
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file next time.
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const rows = csvToMenuItems(text);
    if (rows.length === 0) {
      toast.error("No rows found in that file");
      return;
    }
    setImportPreview(rows);
  }

  // A name-matching row updates in place instead of duplicating.
  function commitImport() {
    if (!importPreview) return;
    const valid = importPreview.filter((r) => !r.error);
    if (valid.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setItems((prev) => {
      const next = [...prev];
      for (const row of valid) {
        const existingIndex = next.findIndex((it) => it.name === row.name);
        // No choice rows for this item leaves its existing customization
        // untouched; any valid choice row replaces it entirely.
        const optionGroups = row.choices.some((c) => !c.error)
          ? { option_groups: optionGroupsFromCsvChoices(row.choices) }
          : {};
        const patch = {
          name: row.name,
          description: row.description,
          price_cents: row.price_cents,
          cost_cents: row.cost_cents,
          available: row.available,
          ...optionGroups,
        };
        if (existingIndex === -1) {
          next.push({
            id: crypto.randomUUID(),
            image_url: null,
            ...patch,
          });
        } else {
          next[existingIndex] = { ...next[existingIndex]!, ...patch };
        }
      }
      return next;
    });
    setImportPreview(null);
    toast.success(
      `Imported ${valid.length} item${valid.length === 1 ? "" : "s"}`,
    );
  }

  function onSave() {
    const sanitized = items.map((it) => ({
      ...it,
      option_groups: sanitizeOptionGroups(it.option_groups),
    }));
    return runSave(async () => {
      const result = await saveMenuItems(boothId, sanitized);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Menu saved");
      router.replace(`/dashboard/booths/${boothId}`);
      await navigatingAway();
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 md:max-w-2xl">
      <Link
        href={`/dashboard/booths/${boothId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to {boothName}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-2xl font-semibold">Menu</h1>
          <InfoTooltip
            content={
              <span className="block max-w-64">
                CSV columns: name, description, price, cost, available — one row
                per item, price/cost optional. Add group_name, group_type
                (one/any), choice_label, choice_price rows right after an item
                for its customization.
              </span>
            }
            ariaLabel="CSV column format"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={onExport}
          >
            <Download className="size-3.5" />
            {items.length === 0 ? "Download template" : "Export CSV"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" /> Import CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileSelected}
            aria-label="Import CSV"
          />
        </div>
      </div>
      {importPreview && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">
            {importPreview.filter((r) => !r.error).length} of{" "}
            {importPreview.length} rows ready to import
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {importPreview.map((row, i) => (
              <li key={i}>
                <div
                  className={row.error ? "text-destructive" : "text-foreground"}
                >
                  {formatImportRow(row)}
                </div>
                {row.choices.length > 0 && (
                  <ul className="ml-4 space-y-0.5">
                    {row.choices.map((choice, ci) => (
                      <li
                        key={ci}
                        className={
                          choice.error
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {formatChoiceRow(choice)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="rounded-lg"
              onClick={commitImport}
            >
              Add to menu
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => setImportPreview(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <MenuEditor
        vendorId={vendorId}
        items={items}
        onChange={setItems}
        entitlement={entitlement}
      />

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-6 py-6">
        <Button
          type="button"
          size="lg"
          className="h-12 flex-1 rounded-xl text-base font-semibold"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save menu"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 rounded-xl"
          onClick={() => router.push(`/dashboard/booths/${boothId}`)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
