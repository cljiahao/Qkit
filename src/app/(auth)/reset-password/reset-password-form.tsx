"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import { passwordChangeSchema } from "@/lib/schemas";

type SessionState = "checking" | "ready" | "no-session";

const cardClass =
  "ticket overflow-hidden rounded-2xl border border-border px-7 py-8 shadow-[0_2px_0_0_var(--color-border),0_18px_40px_-24px_oklch(0.4_0.06_45/0.45)]";
const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

/**
 * Sets a new password on the recovery session established by /auth/callback
 * (the reset link exchanges its code there, then forwards here). If no session
 * is present the link was already used or expired, so we route the user back to
 * sign in rather than showing a form that would fail.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [state, setState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAsyncAction();

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setState(data.user ? "ready" : "no-session");
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  function submit() {
    const parsed = passwordChangeSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your password");
      return;
    }
    setError(null);
    return run(async () => {
      const { error: updateError } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (updateError) {
        toast.error(updateError.message);
        return;
      }
      toast.success("Password updated");
      router.push("/dashboard");
      router.refresh();
    });
  }

  if (state === "checking") {
    return (
      <div className={cardClass}>
        <p className="text-center text-sm text-muted-foreground">
          Checking your reset link…
        </p>
      </div>
    );
  }

  if (state === "no-session") {
    return (
      <div className={cardClass}>
        <h1 className="font-display text-2xl font-semibold leading-tight">
          This link has expired
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Password reset links can only be used once, and they expire after a
          short while. Request a fresh one from the sign-in page.
        </p>
        <Button
          asChild
          variant="outline"
          className="mt-6 h-11 w-full rounded-xl"
        >
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <h1 className="font-display text-2xl font-semibold leading-tight">
        Set a new password
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Pick something at least 8 characters long.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-6 space-y-5"
      >
        <div className="space-y-2">
          <Label htmlFor="new-password" className={labelClass}>
            New password
          </Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
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
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11 rounded-xl"
          />
          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={pending || !password || !confirm}
          className="h-12 w-full rounded-xl text-base font-semibold"
        >
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
