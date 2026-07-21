"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trash2,
  Store,
  Clock,
  UtensilsCrossed,
  Wallet,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Section } from "@/components/ticket-section";
import { useAsyncAction, navigatingAway } from "@/hooks/use-async-action";
import { MenuEditor } from "./menu-editor";
import { WorkingHoursEditor } from "./working-hours-editor";
import { PaymentSection } from "./payment-section";
import { SocialLinksSection } from "./social-links-section";
import { CloseBoothControl } from "./close-booth-control";
import { saveBooth, deleteBooth } from "./actions";
import {
  boothFormSchema,
  sanitizeOptionGroups,
  type MenuItemFormInput,
} from "@/lib/schemas";
import type { Entitlement } from "@/lib/plan";
import type { BoothHours } from "@/lib/hours";
import type { PaymentConfig, SocialLinks } from "@/lib/types";

interface Props {
  vendorId: string;
  entitlement: Entitlement;
  vendorSocialLinks: SocialLinks;
  initial?: {
    boothId: string;
    name: string;
    image_url: string | null;
    is_active: boolean;
    hours: BoothHours;
    menu_items: MenuItemFormInput[];
    payment: PaymentConfig | null;
    social_links: SocialLinks | null;
    requires_arrival_confirm: boolean;
  };
}

export function BoothForm({
  vendorId,
  entitlement,
  vendorSocialLinks,
  initial,
}: Props) {
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
  const [socialLinks, setSocialLinks] = useState<SocialLinks | null>(
    initial?.social_links ?? null,
  );
  const [requiresArrivalConfirm, setRequiresArrivalConfirm] = useState(
    initial?.requires_arrival_confirm ?? false,
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
      await navigatingAway();
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
      social_links: socialLinks,
      requires_arrival_confirm: requiresArrivalConfirm,
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
      await navigatingAway();
    });
  }

  const saveCancelRow = (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-6 py-6">
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
  );

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <Section
            icon={<Store className="size-5" />}
            eyebrow="Shown to customers"
            title="Name & photo"
            description="Your booth's name and banner image."
          >
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
          </Section>

          <Section
            icon={<Clock className="size-5" />}
            eyebrow="When you're open"
            title="Hours & availability"
            description="Turn ordering on/off and set your hours."
          >
            {initial?.boothId ? (
              <CloseBoothControl
                boothId={initial.boothId}
                boothName={name || initial.name}
                isActive={isActive}
                onChanged={setIsActive}
              />
            ) : (
              <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <Checkbox
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                />
                <span className="text-sm">
                  <span className="font-medium">Active</span>
                  <span className="block text-muted-foreground">
                    Customers can only order from active booths.
                  </span>
                </span>
              </label>
            )}

            <WorkingHoursEditor
              value={hours}
              onChange={setHours}
              entitlement={entitlement}
            />

            <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <Checkbox
                checked={requiresArrivalConfirm}
                onCheckedChange={(checked) =>
                  setRequiresArrivalConfirm(checked === true)
                }
              />
              <span className="text-sm">
                <span className="font-medium">
                  Hold prep until the customer arrives
                </span>
                <span className="block text-muted-foreground">
                  For items made fresh per order, like ice cream. The order
                  waits until the customer taps &quot;I&apos;m here&quot; on
                  their status page.
                </span>
              </span>
            </label>
          </Section>

          <Section
            icon={<Wallet className="size-5" />}
            eyebrow="How you get paid"
            title="Payment"
            description="Optional. Customers pay you directly; qkit never touches the money."
          >
            <PaymentSection
              vendorId={vendorId}
              value={payment}
              onChange={setPayment}
            />
          </Section>

          <Section
            icon={<Share2 className="size-5" />}
            eyebrow="Shown to customers"
            title="Social links"
            description="Shown on the order-status page after a customer orders."
          >
            <SocialLinksSection
              value={socialLinks}
              onChange={setSocialLinks}
              vendorDefaults={vendorSocialLinks}
            />
          </Section>
        </div>

        <div>
          <Section
            icon={<UtensilsCrossed className="size-5" />}
            eyebrow="What you sell"
            title="Menu"
            description="Add items customers can order."
          >
            <MenuEditor
              vendorId={vendorId}
              items={items}
              onChange={setItems}
              entitlement={entitlement}
            />
          </Section>
        </div>
      </div>

      {initial?.boothId ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
              Danger zone
            </p>
            <p className="text-sm text-muted-foreground">
              Deleting this booth permanently removes it and every order placed
              at it. The data can&apos;t be retrieved.
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
                    it. This can&apos;t be undone.
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

          {saveCancelRow}
        </div>
      ) : (
        saveCancelRow
      )}
    </form>
  );
}
