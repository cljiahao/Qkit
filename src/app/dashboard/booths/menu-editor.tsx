"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/image-uploader";
import { ProLock } from "@/components/pro-lock";
import { OptionGroupsEditor } from "./option-groups-editor";
import { canAddMenuItem, type Entitlement } from "@/lib/plan";
import { centsToDollarString, parseDollarsToCents } from "@/lib/utils";
import type { MenuItemFormInput } from "@/lib/schemas";
import type { OptionGroup } from "@/lib/types";

interface Props {
  vendorId: string;
  items: MenuItemFormInput[];
  onChange: (items: MenuItemFormInput[]) => void;
  entitlement: Entitlement;
}

function centsToDollars(cents?: number): string {
  return cents == null ? "" : centsToDollarString(cents);
}

export function MenuEditor({ vendorId, items, onChange, entitlement }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const atItemCap = !canAddMenuItem(entitlement, items.length);

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

  function setMoney(
    index: number,
    field: "price_cents" | "cost_cents",
    dollars: string,
  ) {
    const parsed = parseDollarsToCents(dollars);
    // reject NaN/negative, keep prior value
    if (!parsed.ok) return;
    update(index, { [field]: parsed.cents });
  }

  function setPrice(index: number, dollars: string) {
    setMoney(index, "price_cents", dollars);
  }

  function setCost(index: number, dollars: string) {
    setMoney(index, "cost_cents", dollars);
  }

  function setStock(index: number, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      update(index, { stock: null });
      return;
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value < 0) return;
    update(index, { stock: value });
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
        {atItemCap ? (
          <ProLock
            feature="menu_items"
            label={`${entitlement.maxMenuItems}-item limit · Pro`}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={addItem}
          >
            <Plus className="size-3.5" /> Add item
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No items yet. Add one, price is optional (leave blank for a queue-only
          booth).
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[7rem] flex-1">
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
              <div className="relative min-w-[7rem] flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="Cost (optional)"
                  value={centsToDollars(item.cost_cents)}
                  onChange={(e) => setCost(i, e.target.value)}
                  className="rounded-lg pl-7"
                />
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <Checkbox
                  checked={item.available}
                  onCheckedChange={(checked) =>
                    update(i, { available: checked === true })
                  }
                />
                Available
              </label>
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              Cost is private, used only for your profit/margin stats, never
              shown to customers.
            </p>

            {/* Sold-out cap (Pro/pass). Remaining auto-counts from live orders. */}
            {entitlement.stockCaps ? (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Sold-out limit
                </Label>
                <Input
                  inputMode="numeric"
                  placeholder="Unlimited"
                  value={item.stock == null ? "" : String(item.stock)}
                  onChange={(e) => setStock(i, e.target.value)}
                  className="h-9 w-28 rounded-lg"
                />
                <span className="text-xs text-muted-foreground">
                  Orders stop when sold out. Leave blank for unlimited.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ProLock feature="stock_cap" label="Pro" />
                <span className="text-xs text-muted-foreground">
                  Auto-stop orders when an item sells out.
                </span>
              </div>
            )}

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
                        entitlement={entitlement}
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
      {items.length > 0 &&
        (atItemCap ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground">
            <span>Reached your {entitlement.maxMenuItems}-item limit.</span>
            <ProLock feature="menu_items" label="Upgrade" />
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full rounded-lg"
            onClick={addItem}
          >
            <Plus className="size-3.5" /> Add item
          </Button>
        ))}
    </div>
  );
}
