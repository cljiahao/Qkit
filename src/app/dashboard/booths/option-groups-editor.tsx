"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ProLock } from "@/components/pro-lock";
import { canHaveOptionGroups, type Entitlement } from "@/lib/plan";
import { ALLERGEN_TAGS, type AllergenTag } from "@/lib/schemas";
import { centsToDollarString, parseDollarsToCents } from "@/lib/utils";
import type { OptionChoice, OptionGroup } from "@/lib/types";
import { ALLERGEN_ICONS } from "./allergen-icons";

interface Props {
  groups: OptionGroup[];
  onChange: (groups: OptionGroup[]) => void;
  entitlement: Entitlement;
  // The item's own fixed allergens — for the "customer sees" preview below,
  // same union item-customizer.tsx computes at order time.
  itemAllergens: AllergenTag[];
}

function centsToDollars(cents?: number): string {
  return cents == null ? "" : centsToDollarString(cents);
}

// Same union logic as item-customizer.tsx's live customer-facing badge.
function effectiveAllergens(
  itemAllergens: AllergenTag[],
  choiceAllergens: AllergenTag[] | undefined,
): AllergenTag[] {
  return Array.from(new Set([...itemAllergens, ...(choiceAllergens ?? [])]));
}

/**
 * Generic option-group editor used inside the menu editor. A vendor builds any
 * number of groups (Size, Spice, Add-ons, …), each single- or multi-select,
 * with any number of choices. Not coffee-specific.
 */
export function OptionGroupsEditor({
  groups,
  onChange,
  entitlement,
  itemAllergens,
}: Props) {
  // Advanced (cost + allergens) is collapsed by default per choice — most
  // choices need neither, price is the only thing every vendor cares about.
  const [expandedChoices, setExpandedChoices] = useState<Set<string>>(
    new Set(),
  );

  function toggleAdvanced(choiceId: string) {
    setExpandedChoices((prev) => {
      const next = new Set(prev);
      if (next.has(choiceId)) next.delete(choiceId);
      else next.add(choiceId);
      return next;
    });
  }

  // canHaveOptionGroups(count) asks "may an item carry `count` groups?" — so the
  // cap is hit when adding one more (groups.length + 1) is not allowed.
  const atGroupCap = !canHaveOptionGroups(entitlement, groups.length + 1);
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

  function updateChoice(gi: number, ci: number, patch: Partial<OptionChoice>) {
    const group = groups[gi];
    updateGroup(gi, {
      choices: group.choices.map((c, i) => (i === ci ? { ...c, ...patch } : c)),
    });
  }

  function setChoicePrice(gi: number, ci: number, dollars: string) {
    const parsed = parseDollarsToCents(dollars);
    if (!parsed.ok) return;
    updateChoice(gi, ci, {
      price_delta_cents: parsed.cents === 0 ? undefined : parsed.cents,
    });
  }

  function setChoiceCost(gi: number, ci: number, dollars: string) {
    const parsed = parseDollarsToCents(dollars);
    if (!parsed.ok) return;
    updateChoice(gi, ci, {
      cost_delta_cents: parsed.cents === 0 ? undefined : parsed.cents,
    });
  }

  function toggleChoiceAllergen(
    gi: number,
    ci: number,
    choice: OptionChoice,
    tag: AllergenTag,
    checked: boolean,
  ) {
    const current = choice.allergens ?? [];
    const next = checked ? [...current, tag] : current.filter((a) => a !== tag);
    updateChoice(gi, ci, { allergens: next.length ? next : undefined });
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
          {/* Group identity + type, one compact row (was two full-width rows)
              — a one-time-per-group setting, kept visually lighter than the
              repeated choice rows below so it reads as a header, not another
              item in the list. */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Group name (e.g. Size, Spice, Add-ons)"
              value={group.label}
              onChange={(e) => updateGroup(gi, { label: e.target.value })}
              className="min-w-[10rem] flex-1 rounded-lg"
            />
            <ToggleGroup
              type="single"
              value={group.multiple ? "any" : "one"}
              onValueChange={(v) =>
                v && updateGroup(gi, { multiple: v === "any" })
              }
              aria-label="How many options a customer can pick"
              className="inline-flex shrink-0 rounded-lg border border-border p-0.5 text-sm"
            >
              <ToggleGroupItem
                value="one"
                className="rounded-md px-3 py-1 font-medium text-muted-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              >
                Pick one
              </ToggleGroupItem>
              <ToggleGroupItem
                value="any"
                className="rounded-md px-3 py-1 font-medium text-muted-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              >
                Pick any
              </ToggleGroupItem>
            </ToggleGroup>
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

          {/* choices */}
          <div className="space-y-2">
            {group.choices.map((choice, ci) => {
              const advancedOpen = expandedChoices.has(choice.id);
              return (
                <div
                  key={choice.id}
                  className="space-y-1.5 rounded-lg border border-transparent"
                >
                  <div className="flex gap-2">
                    <Input
                      placeholder="Choice (e.g. Small)"
                      value={choice.label}
                      onChange={(e) =>
                        updateChoiceLabel(gi, ci, e.target.value)
                      }
                      className="rounded-lg"
                    />
                    {/* Price matters to every vendor — always visible, not
                        behind the Advanced accordion below. */}
                    <div className="relative w-28 shrink-0">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        inputMode="decimal"
                        placeholder="Price (opt.)"
                        value={centsToDollars(choice.price_delta_cents)}
                        onChange={(e) => setChoicePrice(gi, ci, e.target.value)}
                        className="rounded-lg pl-6"
                      />
                    </div>
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

                  {/* Advanced: extra cost + allergens — collapsed by default,
                      most choices need neither. */}
                  <button
                    type="button"
                    onClick={() => toggleAdvanced(choice.id)}
                    className="flex items-center gap-1 pl-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {advancedOpen ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                    Advanced
                  </button>
                  {advancedOpen && (
                    <div className="mt-1 space-y-2 pb-2 pl-1">
                      <p className="text-xs text-muted-foreground">
                        Extra cost and allergens only when this choice is
                        picked.
                      </p>
                      <div className="relative w-32">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          $
                        </span>
                        <Input
                          inputMode="decimal"
                          placeholder="Cost (opt.)"
                          value={centsToDollars(choice.cost_delta_cents)}
                          onChange={(e) =>
                            setChoiceCost(gi, ci, e.target.value)
                          }
                          className="rounded-lg pl-6"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {ALLERGEN_TAGS.map((tag) => (
                          <label
                            key={tag}
                            className="flex items-center gap-1.5 text-xs capitalize"
                          >
                            <Checkbox
                              checked={(choice.allergens ?? []).includes(tag)}
                              onCheckedChange={(checked) =>
                                toggleChoiceAllergen(
                                  gi,
                                  ci,
                                  choice,
                                  tag,
                                  checked === true,
                                )
                              }
                            />
                            <span aria-hidden="true">
                              {ALLERGEN_ICONS[tag]}
                            </span>
                            {tag}
                          </label>
                        ))}
                      </div>
                      {(() => {
                        const effective = effectiveAllergens(
                          itemAllergens,
                          choice.allergens,
                        );
                        return (
                          effective.length > 0 && (
                            <div className="space-y-1 border-t border-border/60 pt-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Customer sees when picked:
                              </p>
                              <div
                                role="status"
                                aria-label="Contains allergens"
                                className="flex flex-wrap gap-1.5"
                              >
                                {effective.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full border border-status-cancelled/40 bg-status-cancelled/10 px-2 py-0.5 text-xs font-medium capitalize text-status-cancelled"
                                  >
                                    <span aria-hidden="true">
                                      {ALLERGEN_ICONS[tag]}
                                    </span>{" "}
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
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

      {atGroupCap ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {entitlement.maxOptionGroupsPerItem}-group limit per item.
          </span>
          <ProLock feature="option_groups" label="Upgrade" />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={addGroup}
        >
          <Plus className="size-3.5" /> Add option group
        </Button>
      )}
    </div>
  );
}
