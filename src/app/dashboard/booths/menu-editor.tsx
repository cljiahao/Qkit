"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Copy,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@merqo/ui";
import { MediaImage } from "@/components/media-image";
import { uploadQkitImage } from "@/lib/image-upload-adapter";
import { resizeToWebp } from "@/lib/image-resize";
import { ProLock } from "@/components/pro-lock";
import { OptionGroupsEditor } from "./option-groups-editor";
import { canAddMenuItem, type Entitlement } from "@/lib/plan";
import { centsToDollarString, parseDollarsToCents } from "@/lib/utils";
import {
  ALLERGEN_TAGS,
  type AllergenTag,
  type MenuItemFormInput,
} from "@/lib/schemas";
import type { OptionGroup } from "@/lib/types";

// Rendering-only — no effect on the stored tag values (ALLERGEN_TAGS).
const ALLERGEN_ICONS: Record<AllergenTag, string> = {
  dairy: "🥛",
  nuts: "🌰",
  gluten: "🌾",
  soy: "🌱",
  egg: "🥚",
  caffeine: "☕",
  crustaceans: "🦐",
  fish: "🐟",
  peanuts: "🥜",
  celery: "🥬",
  mustard: "🟡",
  sesame: "⚫",
  sulphites: "🧪",
  lupin: "🫘",
  molluscs: "🐚",
};

interface Props {
  vendorId: string;
  items: MenuItemFormInput[];
  onChange: (items: MenuItemFormInput[]) => void;
  entitlement: Entitlement;
}

function centsToDollars(cents?: number): string {
  return cents == null ? "" : centsToDollarString(cents);
}

/** Pure reorder step behind the drag handle — same array instance back when
 * there's nothing to do, so callers can skip onChange with a `!==` check. */
export function reorderMenuItems(
  items: MenuItemFormInput[],
  activeId: string,
  overId: string,
): MenuItemFormInput[] {
  if (activeId === overId) return items;
  const oldIndex = items.findIndex((it) => it.id === activeId);
  const newIndex = items.findIndex((it) => it.id === overId);
  if (oldIndex === -1 || newIndex === -1) return items;
  return arrayMove(items, oldIndex, newIndex);
}

export function MenuEditor({ vendorId, items, onChange, entitlement }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Separate collapse state from "Customization" — allergens are a distinct
  // concept (fixed ingredients, not option groups), collapsed by default
  // since most items don't need them.
  const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(
    new Set(),
  );

  const atItemCap = !canAddMenuItem(entitlement, items.length);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const reordered = reorderMenuItems(
      items,
      String(active.id),
      String(over.id),
    );
    if (reordered !== items) onChange(reordered);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAdvanced(id: string) {
    setExpandedAdvanced((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleItemAllergen(index: number, tag: string, checked: boolean) {
    const item = items[index];
    const current = item.allergens ?? [];
    const next = checked
      ? [...current, tag as (typeof ALLERGEN_TAGS)[number]]
      : current.filter((a) => a !== tag);
    update(index, { allergens: next.length ? next : undefined });
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

  // Deep-cloned (structuredClone) so editing the copy's nested option groups
  // never mutates the original — qkit has no shared/live-linked modifier
  // groups yet, so a duplicate is always a fully independent starting point,
  // never a reference.
  function duplicateItem(index: number) {
    if (!canAddMenuItem(entitlement, items.length)) return;
    const source = items[index];
    const copy: MenuItemFormInput = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      name: source.name ? `${source.name} (copy)` : "",
    };
    onChange([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((it) => it.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {items.map((item, i) => (
              <SortableItemCard key={item.id} id={item.id}>
                {({ setNodeRef, style, attributes, listeners }) => (
                  <div
                    ref={setNodeRef}
                    style={style}
                    className="space-y-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="mt-2 shrink-0 cursor-grab touch-none self-start text-muted-foreground hover:text-foreground active:cursor-grabbing"
                        aria-label="Reorder item"
                        {...attributes}
                        {...listeners}
                      >
                        <GripVertical className="size-4" />
                      </button>
                      <ImageUploader
                        bucket="booth-images"
                        pathPrefix={vendorId}
                        value={item.image_url ?? null}
                        onChange={(url) => update(i, { image_url: url })}
                        onUpload={uploadQkitImage}
                        resizeImage={resizeToWebp}
                        imageComponent={MediaImage}
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
                          onChange={(e) =>
                            update(i, { description: e.target.value })
                          }
                          className="rounded-lg"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={() => duplicateItem(i)}
                        disabled={atItemCap}
                        aria-label="Duplicate item"
                        title="Duplicate — creates an independent copy, not a linked one"
                      >
                        <Copy className="size-4" />
                      </Button>
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
                      <div className="relative min-w-[9rem] flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          $
                        </span>
                        <Input
                          inputMode="decimal"
                          placeholder="Price (opt.)"
                          value={centsToDollars(item.price_cents)}
                          onChange={(e) => setPrice(i, e.target.value)}
                          className="rounded-lg pl-7"
                        />
                      </div>
                      <div className="relative min-w-[9rem] flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          $
                        </span>
                        <Input
                          inputMode="decimal"
                          placeholder="Cost (opt.)"
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
                      Cost is private, used only for your profit/margin stats,
                      never shown to customers.
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

                    {/* Advanced: fixed/inherent allergens — collapsed by default,
                most items need none. Anything that varies by customization
                choice is tagged on the choice itself (OptionGroupsEditor). */}
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAdvanced(item.id)}
                          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          {expandedAdvanced.has(item.id) ? (
                            <ChevronDown className="size-3" />
                          ) : (
                            <ChevronRight className="size-3" />
                          )}
                          Advanced
                        </button>
                        {/* At-a-glance allergen summary so a vendor scanning the list
                    doesn't need to expand every item — icon-only, only when set. */}
                        {(item.allergens ?? []).length > 0 && (
                          <span
                            className="flex items-center gap-0.5"
                            aria-label={`Contains allergens: ${(item.allergens ?? []).join(", ")}`}
                          >
                            {(item.allergens ?? []).map((tag) => (
                              <span key={tag} aria-hidden="true">
                                {ALLERGEN_ICONS[tag]}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                      {expandedAdvanced.has(item.id) && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs text-muted-foreground">
                            Allergens always present in this item, regardless of
                            customization.
                          </p>
                          <div className="flex flex-wrap gap-3">
                            {ALLERGEN_TAGS.map((tag) => (
                              <label
                                key={tag}
                                className="flex items-center gap-1.5 text-xs capitalize"
                              >
                                <Checkbox
                                  checked={(item.allergens ?? []).includes(tag)}
                                  onCheckedChange={(checked) =>
                                    toggleItemAllergen(i, tag, checked === true)
                                  }
                                />
                                <span aria-hidden="true">
                                  {ALLERGEN_ICONS[tag]}
                                </span>
                                {tag}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
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
                                onChange={(g) =>
                                  update(i, { option_groups: g })
                                }
                                entitlement={entitlement}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </SortableItemCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>

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

type SortableRenderProps = ReturnType<typeof useSortable> & {
  style: React.CSSProperties;
};

// Thin wrapper so useSortable's per-item hook state lives in its own
// component (hooks can't be called directly inside items.map) without
// pulling the large per-item card JSX out of MenuEditor's own closure —
// render-prop hands back exactly what the card needs to become draggable.
function SortableItemCard({
  id,
  children,
}: {
  id: string;
  children: (sortable: SortableRenderProps) => React.ReactNode;
}) {
  const sortable = useSortable({ id });
  return children({
    ...sortable,
    style: {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
    },
  });
}
