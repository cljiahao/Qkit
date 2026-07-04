"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MediaImage } from "@/components/media-image";
import type { MenuItem, SelectedOption } from "@/lib/types";

interface Props {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, options: SelectedOption[]) => void;
}

export function ItemCustomizer({ item, onClose, onAdd }: Props) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-2xl"
      >
        {/* Keyed by id so each drink remounts with fresh default selections —
            no reset effect needed. Content only mounts while the sheet is open. */}
        {item && (
          <CustomizerBody
            key={item.id}
            item={item}
            onConfirm={(options) => {
              onAdd(item, options);
              onClose();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function CustomizerBody({
  item,
  onConfirm,
}: {
  item: MenuItem;
  onConfirm: (options: SelectedOption[]) => void;
}) {
  const groups = item.option_groups ?? [];

  // selected: group id -> array of chosen choice ids. Single-select groups
  // default to the first choice; multi-select groups default to none.
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {};
    for (const g of groups) {
      defaults[g.id] = g.multiple ? [] : g.choices[0] ? [g.choices[0].id] : [];
    }
    return defaults;
  });

  function toggle(group: (typeof groups)[number], choiceId: string) {
    setSelected((s) => {
      const current = s[group.id] ?? [];
      if (group.multiple) {
        const next = current.includes(choiceId)
          ? current.filter((id) => id !== choiceId)
          : [...current, choiceId];
        return { ...s, [group.id]: next };
      }
      // single-select: replace with exactly this choice
      return { ...s, [group.id]: [choiceId] };
    });
  }

  function confirm() {
    const options: SelectedOption[] = groups.flatMap((g) =>
      (selected[g.id] ?? [])
        .map((id) => g.choices.find((c) => c.id === id))
        .filter((c): c is (typeof g.choices)[number] => !!c)
        .map((c) => ({ group: g.label, choice: c.label })),
    );
    onConfirm(options);
  }

  return (
    <>
      {item.image_url && (
        // Sticky hero: the full photo (object-contain, never cropped) sits over a
        // blurred, zoomed copy of itself so there are no letterbox bars. Stays
        // pinned while the options scroll.
        <div className="sticky top-0 z-10 aspect-[16/9] w-full overflow-hidden rounded-t-2xl bg-muted">
          <MediaImage
            src={item.image_url}
            alt=""
            aria-hidden
            fill
            sizes="(max-width: 640px) 100vw, 32rem"
            className="scale-110 object-cover blur-xl"
          />
          <MediaImage
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, 32rem"
            className="object-contain"
          />
          {/* Keep the sheet's close button legible over a bright photo. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/25 to-transparent" />
        </div>
      )}
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
              {g.multiple && (
                <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
                  choose any
                </span>
              )}
            </p>
            {/* Selection state is conveyed by colour alone otherwise (fails WCAG
                1.4.1 / 4.1.2); expose it via radio/checkbox semantics like the
                feedback form does. Single-select = radiogroup, multi = group of
                checkboxes. */}
            <div
              className="flex flex-wrap gap-2"
              role={g.multiple ? "group" : "radiogroup"}
              aria-label={g.label}
            >
              {g.choices.map((c) => {
                const active = (selected[g.id] ?? []).includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role={g.multiple ? "checkbox" : "radio"}
                    aria-checked={active}
                    onClick={() => toggle(g, c.id)}
                    className={`inline-flex min-h-11 items-center rounded-lg border px-3.5 text-sm font-medium transition-colors ${
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
    </>
  );
}
