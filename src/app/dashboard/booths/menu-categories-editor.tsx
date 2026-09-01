"use client";

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
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MenuCategory } from "@/lib/types";

const MAX_CATEGORIES = 40;

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

interface Props {
  categories: MenuCategory[];
  onChange: (categories: MenuCategory[]) => void;
}

/**
 * Booth-level ordered menu sections (`booths.menu_categories`) — the
 * customer menu's own section order comes straight from this list
 * (`groupByCategory`). Deleting a category never touches items that
 * referenced it; a dangling `category` id just buckets into "Other" there.
 */
export function MenuCategoriesEditor({ categories, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const reordered = reorderCategories(
      categories,
      String(active.id),
      String(over.id),
    );
    if (reordered !== categories) onChange(reordered);
  }

  function updateLabel(id: string, label: string) {
    onChange(categories.map((c) => (c.id === id ? { ...c, label } : c)));
  }

  function removeCategory(id: string) {
    onChange(categories.filter((c) => c.id !== id));
  }

  function addCategory() {
    onChange([...categories, { id: crypto.randomUUID(), label: "" }]);
  }

  const atCap = categories.length >= MAX_CATEGORIES;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Menu sections
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={addCategory}
          disabled={atCap}
        >
          <Plus className="size-3.5" /> Add section
        </Button>
      </div>

      {categories.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No sections yet. Items with no section show under a flat
          &quot;Menu&quot; list.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {categories.map((category) => (
              <SortableCategoryRow key={category.id} id={category.id}>
                {({ setNodeRef, style, attributes, listeners }) => (
                  <div
                    ref={setNodeRef}
                    style={style}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                  >
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
                      placeholder="Section name (e.g. Drinks, Snacks)"
                      value={category.label}
                      onChange={(e) => updateLabel(category.id, e.target.value)}
                      className="rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                      onClick={() => removeCategory(category.id)}
                      aria-label="Remove section"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </SortableCategoryRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

type SortableRenderProps = ReturnType<typeof useSortable> & {
  style: React.CSSProperties;
};

function SortableCategoryRow({
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
