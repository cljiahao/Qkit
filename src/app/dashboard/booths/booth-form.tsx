"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/image-uploader";
import { MenuEditor } from "./menu-editor";
import { WorkingHoursEditor } from "./working-hours-editor";
import { saveBooth } from "./actions";
import {
  boothFormSchema,
  sanitizeOptionGroups,
  type MenuItemFormInput,
} from "@/lib/schemas";
import type { BoothHours } from "@/lib/hours";

interface Props {
  vendorId: string;
  initial?: {
    boothId: string;
    name: string;
    image_url: string | null;
    is_active: boolean;
    hours: BoothHours;
    menu_items: MenuItemFormInput[];
  };
}

export function BoothForm({ vendorId, initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(
    initial?.image_url ?? null,
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [hours, setHours] = useState<BoothHours>(initial?.hours ?? null);
  const [items, setItems] = useState<MenuItemFormInput[]>(
    initial?.menu_items ?? [],
  );
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = {
      boothId: initial?.boothId,
      name,
      image_url: imageUrl,
      is_active: isActive,
      hours,
      // Strip half-filled option groups so a blank group/choice never fails
      // optionGroupSchema (choices.min(1)) and blocks the whole save.
      menu_items: items.map((it) => ({
        ...it,
        option_groups: sanitizeOptionGroups(it.option_groups),
      })),
    };
    const parsed = boothFormSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }

    setSaving(true);
    const result = await saveBooth(parsed.data);
    if (!result.success) {
      toast.error(result.error);
      setSaving(false);
      return;
    }
    toast.success("Booth saved");
    // replace + no refresh: a refresh here races and cancels the navigation
    // (same bug as onboarding). The list is revalidate=0 so it refetches on nav.
    router.replace("/dashboard/booths");
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-8">
      <div className="space-y-2.5">
        <Label
          htmlFor="booth-name"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Booth name
        </Label>
        <Input
          id="booth-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mama's Kitchen"
          className="h-12 rounded-xl text-base"
        />
      </div>

      <div className="space-y-2.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Banner
        </Label>
        <ImageUploader
          vendorId={vendorId}
          value={imageUrl}
          onChange={setImageUrl}
        />
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="size-4 accent-[var(--color-primary)]"
        />
        <span className="text-sm">
          <span className="font-medium">Active</span>
          <span className="block text-muted-foreground">
            Customers can only order from active booths.
          </span>
        </span>
      </label>

      <WorkingHoursEditor value={hours} onChange={setHours} />

      <MenuEditor vendorId={vendorId} items={items} onChange={setItems} />

      <div className="flex gap-3">
        <Button
          type="submit"
          size="lg"
          className="h-12 flex-1 rounded-xl text-base font-semibold"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save booth"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 rounded-xl"
          onClick={() => router.push("/dashboard/booths")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
