"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/image-uploader";
import { OptionGroupsEditor } from "./option-groups-editor";
import type { MenuItemFormInput } from "@/lib/schemas";
import type { OptionGroup } from "@/lib/types";

interface Props {
  vendorId: string;
  items: MenuItemFormInput[];
  onChange: (items: MenuItemFormInput[]) => void;
}

function centsToDollars(cents?: number): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export function MenuEditor({ vendorId, items, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function update(index: number, patch: Partial<MenuItemFormInput>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function setPrice(index: number, dollars: string) {
    const trimmed = dollars.trim();
    if (trimmed === "") {
      update(index, { price_cents: undefined });
      return;
    }
    const value = Number(trimmed);
    if (Number.isNaN(value) || value < 0) return;
    update(index, { price_cents: Math.round(value * 100) });
  }

  function addItem() {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        price_cents: undefined,
        image_url: null,
        available: true,
      },
    ]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Menu items
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={addItem}
        >
          <Plus className="size-3.5" /> Add item
        </Button>
      </div>

      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No items yet. Add one — price is optional (leave blank for a
          queue-only booth).
        </p>
      )}

      <div className="space-y-3">
        {items.map((item, i) => (
          <div
            key={item.id}
            className="space-y-3 rounded-xl border border-border bg-card p-3.5"
          >
            <div className="flex gap-2">
              <ImageUploader
                vendorId={vendorId}
                value={item.image_url ?? null}
                onChange={(url) => update(i, { image_url: url })}
                variant="thumb"
              />
              <div className="flex flex-1 flex-col gap-2">
                <Input
                  placeholder="Item name"
                  value={item.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="rounded-lg"
                />
                <Input
                  placeholder="Description (optional)"
                  value={item.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  className="rounded-lg"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(i)}
                aria-label="Remove item"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="Price (optional)"
                  value={centsToDollars(item.price_cents)}
                  onChange={(e) => setPrice(i, e.target.value)}
                  className="rounded-lg pl-7"
                />
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.available}
                  onChange={(e) => update(i, { available: e.target.checked })}
                  className="size-4 accent-[var(--color-primary)]"
                />
                Available
              </label>
            </div>

            {/* Customization — collapsed by default; most items have none. */}
            {(() => {
              const groups: OptionGroup[] = item.option_groups ?? [];
              const isOpen = expanded.has(item.id);
              return (
                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                    Customization
                    {groups.length > 0 && (
                      <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[0.7rem] text-primary">
                        {groups.length}
                      </span>
                    )}
                  </button>
                  {isOpen && (
                    <div className="mt-3">
                      <OptionGroupsEditor
                        groups={groups}
                        onChange={(g) => update(i, { option_groups: g })}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      {/* Bottom add button — reachable without scrolling back up on long menus. */}
      {items.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full rounded-lg"
          onClick={addItem}
        >
          <Plus className="size-3.5" /> Add item
        </Button>
      )}
    </div>
  );
}
