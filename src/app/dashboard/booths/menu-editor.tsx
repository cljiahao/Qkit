"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@merqo/ui";
import { MediaImage } from "@/components/media-image";
import { uploadQkitImage } from "@/lib/image-upload-adapter";
import { resizeToWebp } from "@/lib/image-resize";
import { ProLock } from "@/components/pro-lock";
import { OptionGroupsEditor } from "./option-groups-editor";
import { canAddMenuItem, type Entitlement } from "@/lib/plan";
import { centsToDollarString, parseDollarsToCents } from "@/lib/utils";
import { ALLERGEN_TAGS, type MenuItemFormInput } from "@/lib/schemas";
import type { MenuCategory, OptionGroup } from "@/lib/types";
import { ALLERGEN_ICONS } from "@/lib/allergen-icons";

// Radix Select reserves "" for "no selection" — a real sentinel stands in
// for "no section" instead.
const NO_CATEGORY = "__none__";
// groupId tag for items with no (or a dangling) section — never a real
// category id, those are crypto.randomUUID().
const NO_SECTION_GROUP = "__no_section__";
const REMOVE_UNDO_MS = 60_000;
const MAX_CATEGORIES = 40;

interface Props {
  vendorId: string;
  items: MenuItemFormInput[];
  onChange: (items: MenuItemFormInput[]) => void;
  entitlement: Entitlement;
  categories?: MenuCategory[];
  onCategoriesChange?: (categories: MenuCategory[]) => void;
}

function centsToDollars(cents?: number): string {
  return cents == null ? "" : centsToDollarString(cents);
}

/** Same array instance back when there's nothing to reorder. */
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

/** Same array instance back when there's nothing to reorder. */
export function reorderCategories(
  categories: MenuCategory[],
  activeId: string,
  overId: string,
): MenuCategory[] {
  if (activeId === overId) return categories;
  const oldIndex = categories.findIndex((c) => c.id === activeId);
  const newIndex = categories.findIndex((c) => c.id === overId);
  if (oldIndex === -1 || newIndex === -1) return categories;
  return arrayMove(categories, oldIndex, newIndex);
}

export function MenuEditor({
  vendorId,
  items,
  onChange,
  entitlement,
  categories = [],
  onCategoriesChange = () => {},
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Separate collapse state from "Customization" — allergens are a distinct
  // concept (fixed ingredients, not option groups), collapsed by default
  // since most items don't need them.
  const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(
    new Set(),
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );

  const atItemCap = !canAddMenuItem(entitlement, items.length);
  const atCategoryCap = categories.length >= MAX_CATEGORIES;

  // Undo needs the latest array at click time, not the one closed over when
  // the toast was created — a stale closure would clobber any edit made in
  // between.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const categoriesRef = useRef(categories);
  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Grouped view (by section) once the vendor has sections; reassignment is
  // dropdown-only (below), never cross-group drag — F&B menu builders
  // (Toast, Oddle) and general drag-UX research both converge on "drag
  // reorders in place, a field assigns" once a list can run to hundreds of
  // rows. Drag still reorders items within a group, and sections themselves.
  const sections = useMemo(() => {
    const known = new Set(categories.map((c) => c.id));
    const indexed = items.map((it, i) => ({ it, i }));
    const named = categories.map((c) => ({
      id: c.id,
      label: c.label,
      entries: indexed.filter(({ it }) => it.category === c.id),
    }));
    const restEntries = indexed.filter(
      ({ it }) => !it.category || !known.has(it.category),
    );
    return { named, restEntries };
  }, [items, categories]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as
      | { type: "section" }
      | { type: "item"; groupId: string }
      | undefined;
    if (activeData?.type === "section") {
      if (active.id === over.id) return;
      const reordered = reorderCategories(
        categories,
        String(active.id),
        String(over.id),
      );
      if (reordered !== categories) onCategoriesChange(reordered);
      return;
    }
    if (activeData?.type === "item") {
      const overData = over.data.current as
        | { type: "item"; groupId: string }
        | undefined;
      if (overData?.type !== "item") return;
      if (activeData.groupId !== overData.groupId) return;
      const reordered = reorderMenuItems(
        items,
        String(active.id),
        String(over.id),
      );
      if (reordered !== items) onChange(reordered);
    }
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

  function toggleSectionCollapsed(id: string) {
    setCollapsedSections((prev) => {
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
    const removed = items[index];
    onChange(items.filter((_, i) => i !== index));
    toast(`${removed.name || "Item"} removed`, {
      duration: REMOVE_UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const current = itemsRef.current;
          const at = Math.min(index, current.length);
          onChange([...current.slice(0, at), removed, ...current.slice(at)]);
        },
      },
    });
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

  function addCategory() {
    onCategoriesChange([...categories, { id: crypto.randomUUID(), label: "" }]);
  }

  function renameCategory(id: string, label: string) {
    onCategoriesChange(
      categories.map((c) => (c.id === id ? { ...c, label } : c)),
    );
  }

  // No cascade-clear on delete — a dangling `category` id on an item just
  // buckets into "No section" here (and "Other" on the customer page).
  function removeCategory(id: string) {
    const index = categories.findIndex((c) => c.id === id);
    if (index === -1) return;
    const removed = categories[index]!;
    onCategoriesChange(categories.filter((c) => c.id !== id));
    toast(`${removed.label || "Section"} removed`, {
      duration: REMOVE_UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const current = categoriesRef.current;
          const at = Math.min(index, current.length);
          onCategoriesChange([
            ...current.slice(0, at),
            removed,
            ...current.slice(at),
          ]);
        },
      },
    });
  }

  function renderItem(index: number, groupId: string, standalone: boolean) {
    const item = items[index];
    const groups: OptionGroup[] = item.option_groups ?? [];
    const isOpen = expanded.has(item.id);

    return (
      <SortableItemCard
        key={item.id}
        id={item.id}
        data={{ type: "item", groupId }}
      >
        {({ setNodeRef, style, attributes, listeners }) => (
          <div
            ref={setNodeRef}
            style={style}
            className={
              standalone
                ? "space-y-3 rounded-xl border border-border bg-card p-3.5"
                : "space-y-3 p-3.5"
            }
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
                onChange={(url) => update(index, { image_url: url })}
                onUpload={uploadQkitImage}
                resizeImage={resizeToWebp}
                imageComponent={MediaImage}
                variant="thumb"
              />
              <div className="flex flex-1 flex-col gap-2">
                <Input
                  placeholder="Item name"
                  value={item.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                  className="rounded-lg"
                />
                <Input
                  placeholder="Description (optional)"
                  value={item.description}
                  onChange={(e) =>
                    update(index, { description: e.target.value })
                  }
                  className="rounded-lg"
                />
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.available}
                  aria-label="Available"
                  title={
                    item.available
                      ? "Available — tap to hide from the menu"
                      : "Hidden — tap to make available again"
                  }
                  onClick={() => update(index, { available: !item.available })}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground data-[unavailable=true]:border-dashed data-[unavailable=true]:text-muted-foreground/60"
                  data-unavailable={!item.available}
                >
                  {item.available ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => duplicateItem(index)}
                  disabled={atItemCap}
                  aria-label="Duplicate item"
                  title="Duplicate: creates an independent copy, not a linked one"
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-lg text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(index)}
                  aria-label="Remove item"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
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
                  onChange={(e) => setPrice(index, e.target.value)}
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
                  onChange={(e) => setCost(index, e.target.value)}
                  className="rounded-lg pl-7"
                />
              </div>
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              Cost is private, used only for your profit/margin stats, never
              shown to customers.
            </p>

            {categories.length > 0 && (
              <div className="flex items-center gap-2">
                <Label className="shrink-0 text-xs font-medium text-muted-foreground">
                  Section
                </Label>
                <Select
                  value={item.category ?? NO_CATEGORY}
                  onValueChange={(v) =>
                    update(index, {
                      category: v === NO_CATEGORY ? null : v,
                    })
                  }
                >
                  <SelectTrigger className="h-9 w-full rounded-lg sm:w-56">
                    <SelectValue placeholder="No section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>No section</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label || "Untitled"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                  onChange={(e) => setStock(index, e.target.value)}
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
                            toggleItemAllergen(index, tag, checked === true)
                          }
                        />
                        <span aria-hidden="true">{ALLERGEN_ICONS[tag]}</span>
                        {tag}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Customization — collapsed by default; most items have none. */}
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
                    onChange={(g) => update(index, { option_groups: g })}
                    entitlement={entitlement}
                    itemAllergens={item.allergens ?? []}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </SortableItemCard>
    );
  }

  const hasSections = categories.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Menu items
        </Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={addCategory}
            disabled={atCategoryCap}
          >
            <Plus className="size-3.5" /> Add section
          </Button>
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
        {!hasSections && items.length > 0 && (
          <SortableContext
            items={items.map((it) => it.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {items.map((_, i) => renderItem(i, NO_SECTION_GROUP, true))}
            </div>
          </SortableContext>
        )}

        {hasSections && (
          <SortableContext
            items={categories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {sections.named.map((group) => {
                const collapsed = collapsedSections.has(group.id);
                return (
                  <SortableSectionGroup key={group.id} id={group.id}>
                    {({ setNodeRef, style, attributes, listeners }) => (
                      <div
                        ref={setNodeRef}
                        style={style}
                        className="rounded-xl border border-border bg-card"
                      >
                        <div className="flex items-center gap-1.5 px-2 py-2">
                          <button
                            type="button"
                            onClick={() => toggleSectionCollapsed(group.id)}
                            aria-label={
                              collapsed ? "Expand section" : "Collapse section"
                            }
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            {collapsed ? (
                              <ChevronRight className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                            aria-label="Reorder section"
                            {...attributes}
                            {...listeners}
                          >
                            <GripVertical className="size-4" />
                          </button>
                          <Input
                            value={group.label}
                            onChange={(e) =>
                              renameCategory(group.id, e.target.value)
                            }
                            placeholder="Section name"
                            className="h-8 flex-1 rounded-md border-transparent bg-transparent px-1.5 font-medium shadow-none hover:border-border focus-visible:border-border"
                          />
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {group.entries.length}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeCategory(group.id)}
                            aria-label="Remove section"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                        {!collapsed &&
                          (group.entries.length === 0 ? (
                            <p className="border-t border-border px-3.5 py-4 text-center text-xs text-muted-foreground">
                              No items yet. Add one below, then set its section
                              to {group.label || "this one"}.
                            </p>
                          ) : (
                            <SortableContext
                              items={group.entries.map(({ it }) => it.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="divide-y divide-border border-t border-border">
                                {group.entries.map(({ i }) =>
                                  renderItem(i, group.id, false),
                                )}
                              </div>
                            </SortableContext>
                          ))}
                      </div>
                    )}
                  </SortableSectionGroup>
                );
              })}
            </div>
          </SortableContext>
        )}

        {hasSections && sections.restEntries.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-sm font-medium text-muted-foreground">
                No section
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {sections.restEntries.length}
              </span>
            </div>
            <SortableContext
              items={sections.restEntries.map(({ it }) => it.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-border border-t border-border">
                {sections.restEntries.map(({ i }) =>
                  renderItem(i, NO_SECTION_GROUP, false),
                )}
              </div>
            </SortableContext>
          </div>
        )}
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

// useSortable can't be called directly inside items.map.
function SortableItemCard({
  id,
  data,
  children,
}: {
  id: string;
  data: { type: "item"; groupId: string };
  children: (sortable: SortableRenderProps) => React.ReactNode;
}) {
  const sortable = useSortable({ id, data });
  return children({
    ...sortable,
    style: {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
    },
  });
}

function SortableSectionGroup({
  id,
  children,
}: {
  id: string;
  children: (sortable: SortableRenderProps) => React.ReactNode;
}) {
  const sortable = useSortable({ id, data: { type: "section" } });
  return children({
    ...sortable,
    style: {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
    },
  });
}
