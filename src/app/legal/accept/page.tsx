import { AcceptForm } from "./accept-form";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const revalidate = 0;

// Deliberately does NOT call any legal-gate check (requireVendor /
// requireEntitledVendor / requireCurrentLegalAcceptance) — this page is what
// that gate redirects TO, so gating it the same way is an infinite redirect
// loop. acceptLegalTerms (actions.ts) re-checks for a signed-in user on submit
// and sends a signed-out visitor to /login.
export default async function LegalAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="mb-4 text-xl font-semibold">
        Our terms have been updated
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Please review and accept before continuing.
      </p>
      <AcceptForm next={safeRedirectPath(next, "/dashboard")} />
    </div>
  );
}
