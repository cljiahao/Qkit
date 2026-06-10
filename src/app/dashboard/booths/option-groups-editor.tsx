"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OptionGroup } from "@/lib/types";

interface Props {
  groups: OptionGroup[];
  onChange: (groups: OptionGroup[]) => void;
}

/**
 * Generic option-group editor used inside the menu editor. A vendor builds any
 * number of groups (Size, Spice, Add-ons, …), each single- or multi-select,
 * with any number of choices. Not coffee-specific.
 */
export function OptionGroupsEditor({ groups, onChange }: Props) {
  function updateGroup(gi: number, patch: Partial<OptionGroup>) {
    onChange(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    onChange([
      ...groups,
      {
        id: crypto.randomUUID(),
        label: "",
        multiple: false,
        choices: [{ id: crypto.randomUUID(), label: "" }],
      },
    ]);
  }

  function removeGroup(gi: number) {
    onChange(groups.filter((_, i) => i !== gi));
  }

  function updateChoiceLabel(gi: number, ci: number, label: string) {
    const group = groups[gi];
    updateGroup(gi, {
      choices: group.choices.map((c, i) => (i === ci ? { ...c, label } : c)),
    });
  }

  function addChoice(gi: number) {
    const group = groups[gi];
    updateGroup(gi, {
      choices: [...group.choices, { id: crypto.randomUUID(), label: "" }],
    });
  }

  function removeChoice(gi: number, ci: number) {
    const group = groups[gi];
    updateGroup(gi, {
      choices: group.choices.filter((_, i) => i !== ci),
    });
  }

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => (
        <div
          key={group.id}
          className="space-y-3 rounded-lg border border-border bg-background p-3"
        >
          <div className="flex gap-2">
            <Input
              placeholder="Group name (e.g. Size, Spice, Add-ons)"
              value={group.label}
              onChange={(e) => updateGroup(gi, { label: e.target.value })}
              className="rounded-lg"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
              onClick={() => removeGroup(gi)}
              aria-label="Remove group"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          {/* single / multi toggle */}
          <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
            <button
              type="button"
              onClick={() => updateGroup(gi, { multiple: false })}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                !group.multiple
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground"
              }`}
            >
              Pick one
            </button>
            <button
              type="button"
              onClick={() => updateGroup(gi, { multiple: true })}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                group.multiple
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground"
              }`}
            >
              Pick any
            </button>
          </div>

          {/* choices */}
          <div className="space-y-2">
            {group.choices.map((choice, ci) => (
              <div key={choice.id} className="flex gap-2">
                <Input
                  placeholder="Choice (e.g. Small)"
                  value={choice.label}
                  onChange={(e) => updateChoiceLabel(gi, ci, e.target.value)}
                  className="rounded-lg"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                  onClick={() => removeChoice(gi, ci)}
                  aria-label="Remove choice"
                  disabled={group.choices.length <= 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg text-muted-foreground"
              onClick={() => addChoice(gi)}
            >
              <Plus className="size-3.5" /> Add choice
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-lg"
        onClick={addGroup}
      >
        <Plus className="size-3.5" /> Add option group
      </Button>
    </div>
  );
}
