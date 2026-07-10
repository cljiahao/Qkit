"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ImageUploader } from "@/components/image-uploader";
import { useAsyncAction } from "@/hooks/use-async-action";
import { MenuEditor } from "./menu-editor";
import { WorkingHoursEditor } from "./working-hours-editor";
import { PaymentSection } from "./payment-section";
import { saveBooth, deleteBooth } from "./actions";
import {
  boothFormSchema,
  sanitizeOptionGroups,
  type MenuItemFormInput,
} from "@/lib/schemas";
import type { Entitlement } from "@/lib/plan";
import type { BoothHours } from "@/lib/hours";
import type { PaymentConfig } from "@/lib/types";

interface Props {
  vendorId: string;
  entitlement: Entitlement;
  initial?: {
    boothId: string;
    name: string;
    image_url: string | null;
    is_active: boolean;
    hours: BoothHours;
    menu_items: MenuItemFormInput[];
    payment: PaymentConfig | null;
  };
}

export function BoothForm({ vendorId, entitlement, initial }: Props) {
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
  const [payment, setPayment] = useState<PaymentConfig | null>(
    initial?.payment ?? null,
  );
  const { pending: saving, run: runSave } = useAsyncAction();
  const { pending: deleting, run: runDelete } = useAsyncAction();

  function onDelete() {
    if (!initial?.boothId) return;
    return runDelete(async () => {
      const result = await deleteBooth(initial.boothId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Booth deleted");
      router.replace("/dashboard/booths");
    });
  }

  function onSubmit(e: React.FormEvent) {
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
      payment,
    };
    const parsed = boothFormSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }

    return runSave(async () => {
      const result = await saveBooth(parsed.data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Booth saved");
      // replace + no refresh: a refresh here races and cancels the navigation
      // (same bug as onboarding). The list is revalidate=0 so it refetches on nav.
      router.replace("/dashboard/booths");
    });
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

      <WorkingHoursEditor
        value={hours}
        onChange={setHours}
        entitlement={entitlement}
      />

      <MenuEditor
        vendorId={vendorId}
        items={items}
        onChange={setItems}
        entitlement={entitlement}
      />

      <PaymentSection
        vendorId={vendorId}
        value={payment}
        onChange={setPayment}
      />

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

      {initial?.boothId && (
        <div className="space-y-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
            Danger zone
          </p>
          <p className="text-sm text-muted-foreground">
            Deleting this booth permanently removes it and every order placed at
            it. The data can&apos;t be retrieved.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
                disabled={deleting || saving}
              >
                <Trash2 className="size-4" />
                {deleting ? "Deleting…" : "Delete booth"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{initial.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the booth and every order placed at
                  it. The data cannot be retrieved — this can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>
                  Keep booth
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  disabled={deleting}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete booth
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </form>
  );
}
