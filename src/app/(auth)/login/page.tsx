"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import { loginSchema, type LoginInput } from "@/lib/schemas";

type Mode = "signin" | "signup";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.05rem]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("signin");
  const { pending: loading, run } = useAsyncAction();
  // Set when we've emailed the user and are waiting on them to click a link:
  // "signup" = confirm the new account, "reset" = choose a new password.
  const [sent, setSent] = useState<{
    email: string;
    kind: "signup" | "reset";
  } | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  function signInWithGoogle() {
    return run(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) toast.error(error.message);
      // On success the browser navigates to Google; no further action here.
    });
  }

  function onSubmit(data: LoginInput) {
    return run(async () => {
      if (mode === "signup") {
        const { data: result, error } = await supabase.auth.signUp(data);
        if (error) {
          toast.error(error.message);
          return;
        }
        // Email confirmation on → no session yet. Show a "check your email" state
        // instead of bouncing to a dashboard the user can't reach.
        if (!result.session) {
          setSent({ email: data.email, kind: "signup" });
          return;
        }
        router.push("/dashboard");
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword(data);
      if (error) {
        toast.error(error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  // Email a password-reset link. The link lands on /auth/callback, which
  // establishes a recovery session and forwards to /reset-password.
  function sendReset() {
    const email = getValues("email");
    const parsed = loginSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      toast.error("Enter your email first");
      return;
    }
    return run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setSent({ email, kind: "reset" });
    });
  }

  const isSignin = mode === "signin";

  if (sent) {
    const isReset = sent.kind === "reset";
    return (
      <main className="min-h-screen flex items-center justify-center p-5">
        <div className="w-full max-w-md text-center">
          <div className="ticket overflow-hidden rounded-2xl border border-border px-7 py-10 shadow-[0_2px_0_0_var(--color-border),0_18px_40px_-24px_oklch(0.4_0.06_45/0.45)]">
            <span className="font-display inline-flex items-baseline gap-0.5 text-2xl font-semibold tracking-tight">
              <span className="text-primary">Q</span>Kit
            </span>
            <h1 className="font-display mt-6 text-3xl font-semibold leading-tight">
              Check your email
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {isReset ? (
                <>
                  We sent a password reset link to{" "}
                  <span className="font-medium text-foreground">
                    {sent.email}
                  </span>
                  . Open it to choose a new password.
                </>
              ) : (
                <>
                  We sent a confirmation link to{" "}
                  <span className="font-medium text-foreground">
                    {sent.email}
                  </span>
                  . Click it to activate your account, then sign in.
                </>
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-7 h-11 w-full rounded-xl"
              onClick={() => {
                setSent(null);
                setMode("signin");
              }}
            >
              Back to sign in
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        {/* Brand lockup */}
        <div className="mb-8 text-center">
          <span className="font-display inline-flex items-baseline gap-0.5 text-3xl font-semibold tracking-tight">
            <span className="text-primary">Q</span>Kit
          </span>
          <p className="mt-1 text-sm text-muted-foreground">
            Run your booth. Watch orders land live.
          </p>
        </div>

        <div className="ticket overflow-hidden rounded-2xl border border-border shadow-[0_2px_0_0_var(--color-border),0_18px_40px_-24px_oklch(0.4_0.06_45/0.45)]">
          <div className="px-7 pt-9 pb-8">
            <h1 className="font-display text-3xl font-semibold leading-tight">
              {isSignin ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isSignin
                ? "Sign in to your vendor dashboard."
                : "Set up a vendor account in seconds."}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={signInWithGoogle}
              disabled={loading}
              className="mt-7 h-12 w-full gap-2.5 rounded-xl border-border bg-background text-[0.95rem] font-medium shadow-none hover:bg-secondary"
            >
              <GoogleMark />
              Continue with Google
            </Button>

            <div className="my-6 flex items-center gap-3">
              <span className="perforation flex-1" />
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                or with email
              </span>
              <span className="perforation flex-1" />
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="h-11 rounded-xl"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email")}
                />
                {errors.email && (
                  <p
                    id="email-error"
                    className="text-sm font-medium text-destructive"
                  >
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="password"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Password
                  </Label>
                  {isSignin && (
                    <button
                      type="button"
                      onClick={sendReset}
                      disabled={loading}
                      className="text-xs font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="h-11 rounded-xl"
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  {...register("password")}
                />
                {errors.password && (
                  <p
                    id="password-error"
                    className="text-sm font-medium text-destructive"
                  >
                    {errors.password.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-xl text-base font-semibold"
                disabled={loading}
              >
                {loading
                  ? "Please wait…"
                  : isSignin
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>
          </div>

          <div className="perforation" />
          <p className="bg-card px-7 py-4 text-center text-sm text-muted-foreground">
            {isSignin ? "New to QKit? " : "Already have an account? "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => setMode(isSignin ? "signup" : "signin")}
            >
              {isSignin ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
