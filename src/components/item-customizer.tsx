"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { MenuItem, SelectedOption } from "@/lib/types";

interface Props {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, options: SelectedOption[]) => void;
}

export function ItemCustomizer({ item, onClose, onAdd }: Props) {
  // selected: group id -> choice id
  const [selected, setSelected] = useState<Record<string, string>>({});

  // Reset to defaults (first choice per group) whenever a new item opens.
  useEffect(() => {
    if (!item) return;
    const defaults: Record<string, string> = {};
    for (const g of item.option_groups ?? []) {
      if (g.choices[0]) defaults[g.id] = g.choices[0].id;
    }
    setSelected(defaults);
  }, [item]);

  if (!item) return null;
  const groups = item.option_groups ?? [];

  function confirm() {
    if (!item) return;
    const options: SelectedOption[] = groups.map((g) => {
      const choice =
        g.choices.find((c) => c.id === selected[g.id]) ?? g.choices[0];
      return { group: g.label, choice: choice.label };
    });
    onAdd(item, options);
    onClose();
  }

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">{item.name}</SheetTitle>
          {item.description && (
            <SheetDescription>{item.description}</SheetDescription>
          )}
        </SheetHeader>

        <div className="space-y-5 px-4">
          {groups.map((g) => (
            <div key={g.id} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.choices.map((c) => {
                  const active = selected[g.id] === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelected((s) => ({ ...s, [g.id]: c.id }))
                      }
                      className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-foreground hover:border-primary/40"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <SheetFooter>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full rounded-xl text-base font-semibold"
            onClick={confirm}
          >
            Add to order
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
