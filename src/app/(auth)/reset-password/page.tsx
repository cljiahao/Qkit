import { ResetPasswordForm } from "./reset-password-form";

export const revalidate = 0;

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        {/* Brand lockup */}
        <div className="mb-8 text-center">
          <span className="font-display inline-flex items-baseline gap-0.5 text-3xl font-semibold tracking-tight">
            <span className="text-primary">Q</span>Kit
          </span>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a new password for your account.
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
