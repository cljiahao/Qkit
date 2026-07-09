"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, IdCard, KeyRound, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/image-uploader";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  profileNameSchema,
  displayNameSchema,
  passwordChangeSchema,
} from "@/lib/schemas";
import { updateStallName } from "./actions";

interface Props {
  stallName: string;
  displayName: string;
  email: string;
  vendorId: string;
  avatarUrl: string | null;
}

/** Small ticket-card wrapper for one independently-saved profile section. */
function Section({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ticket mb-5 break-inside-avoid-column overflow-hidden rounded-2xl border border-border px-6 py-6 shadow-[0_2px_0_0_var(--color-border)]">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="font-display text-xl font-semibold leading-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const errorClass = "text-sm font-medium text-destructive";

export function ProfileForm({
  stallName,
  displayName,
  email,
  vendorId,
  avatarUrl,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  // Stall name (vendors.name) — persisted via a server action + RLS.
  const [name, setName] = useState(stallName);
  const [nameError, setNameError] = useState<string | null>(null);
  const { pending: savingName, run: runName } = useAsyncAction();

  // Profile icon (auth user_metadata.avatar_url) — the ImageUploader handles the
  // storage upload; we persist the returned URL on the auth user, same channel
  // as the display name. null clears it and the initials badge takes over.
  const [avatar, setAvatar] = useState(avatarUrl);
  const { run: runAvatar } = useAsyncAction();

  // Display name (auth user_metadata) — persisted via the browser auth client.
  const [display, setDisplay] = useState(displayName);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const { pending: savingDisplay, run: runDisplay } = useAsyncAction();

  // Change password — persisted via the browser auth client.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const { pending: savingPw, run: runPw } = useAsyncAction();

  function saveStall() {
    const parsed = profileNameSchema.safeParse({ name });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? "Invalid stall name");
      return;
    }
    setNameError(null);
    return runName(async () => {
      const res = await updateStallName({ name: parsed.data.name });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Stall name saved");
      router.refresh();
    });
  }

  function saveAvatar(url: string | null) {
    setAvatar(url);
    return runAvatar(async () => {
      const { error } = await supabase.auth.updateUser({
        data: { avatar_url: url },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(url ? "Profile icon saved" : "Profile icon removed");
      router.refresh();
    });
  }

  function saveDisplayName() {
    const parsed = displayNameSchema.safeParse({ displayName: display });
    if (!parsed.success) {
      setDisplayError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    setDisplayError(null);
    return runDisplay(async () => {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: parsed.data.displayName },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Display name saved");
      router.refresh();
    });
  }

  function savePassword() {
    const parsed = passwordChangeSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setPwError(parsed.error.issues[0]?.message ?? "Check your password");
      return;
    }
    setPwError(null);
    return runPw(async () => {
      const { error } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    });
  }

  return (
    <div className="lg:columns-2 lg:gap-5">
      <Section
        icon={<Store className="size-5" />}
        eyebrow="Shown to customers"
        title="Stall name"
        description="The name on your booth page and order tickets."
      >
        <div className="space-y-2">
          <Label htmlFor="stall-name" className={labelClass}>
            Stall name
          </Label>
          <Input
            id="stall-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-xl"
            aria-invalid={!!nameError}
            aria-describedby={nameError ? "stall-name-error" : undefined}
          />
          {nameError && (
            <p id="stall-name-error" className={errorClass}>
              {nameError}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveStall}
            disabled={savingName || name === stallName}
            className="h-10 rounded-xl font-semibold"
          >
            {savingName ? "Saving…" : "Save stall name"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<UserRound className="size-5" />}
        eyebrow="Your account menu"
        title="Profile icon"
        description="A small image for your account menu. Defaults to your initials."
      >
        <div className="flex items-center gap-4">
          <ImageUploader
            vendorId={vendorId}
            value={avatar}
            onChange={saveAvatar}
            variant="thumb"
          />
          <p className="text-xs text-muted-foreground">
            Square images look best. Remove it any time to fall back to your
            initials badge.
          </p>
        </div>
      </Section>

      <Section
        icon={<IdCard className="size-5" />}
        eyebrow="Just for you"
        title="Display name"
        description="How QKit addresses you. Customers never see this."
      >
        <div className="space-y-2">
          <Label htmlFor="display-name" className={labelClass}>
            Display name
          </Label>
          <Input
            id="display-name"
            value={display}
            maxLength={60}
            placeholder="e.g. Aisha"
            onChange={(e) => setDisplay(e.target.value)}
            className="h-11 rounded-xl"
            aria-invalid={!!displayError}
            aria-describedby={displayError ? "display-name-error" : undefined}
          />
          {displayError && (
            <p id="display-name-error" className={errorClass}>
              {displayError}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClass}>
            Email
          </Label>
          <Input
            id="email"
            value={email}
            readOnly
            disabled
            className="h-11 rounded-xl bg-secondary/60"
          />
          <p className="text-xs text-muted-foreground">
            Your sign-in email. It can&apos;t be changed here yet.
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveDisplayName}
            disabled={savingDisplay || display === displayName}
            className="h-10 rounded-xl font-semibold"
          >
            {savingDisplay ? "Saving…" : "Save display name"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<KeyRound className="size-5" />}
        eyebrow="Sign-in security"
        title="Change password"
        description="Set a new password. At least 8 characters."
      >
        <div className="space-y-2">
          <Label htmlFor="new-password" className={labelClass}>
            New password
          </Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password" className={labelClass}>
            Confirm new password
          </Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            placeholder="••••••••"
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11 rounded-xl"
            aria-invalid={!!pwError}
            aria-describedby={pwError ? "confirm-password-error" : undefined}
          />
          {pwError && (
            <p id="confirm-password-error" className={errorClass}>
              {pwError}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={savePassword}
            disabled={savingPw || !password || !confirm}
            className="h-10 rounded-xl font-semibold"
          >
            {savingPw ? "Updating…" : "Update password"}
          </Button>
        </div>
      </Section>
    </div>
  );
}
