import Link from "next/link";
import { LandingNav } from "@merqo/ui";
import { Button } from "@/components/ui/button";

export function Nav({ authed }: { authed: boolean }) {
  return (
    <LandingNav
      wordmark={
        // Plain <a>, not next/link's Link: this is a same-page hash jump
        // (already on "/"), and Link doesn't reliably update the URL bar's
        // hash when only the fragment changes — it scrolls but leaves the
        // old hash showing. A native anchor always gets this right.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a
          href="/#top"
          aria-label="qkit home, back to top"
          className="font-display inline-flex items-baseline gap-0.5 text-3xl font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="text-primary">Q</span>Kit
        </a>
      }
      end={
        <>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden rounded-lg sm:inline-flex"
          >
            {/* Plain <a>, not Link — same reasoning as the wordmark above: a
                native anchor jumps straight to the hash whether this nav is
                rendered on "/" itself (same-page jump) or on "/about"
                (full navigation to "/", then the hash), where Link's
                same-page-hash-only-change caveat doesn't apply cleanly
                either way. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/#faq">FAQ</a>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden rounded-lg sm:inline-flex"
          >
            <Link href="/about">About</Link>
          </Button>
          {authed ? (
            <Button asChild variant="ghost" size="sm" className="rounded-lg">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="rounded-lg">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="rounded-lg">
                <Link href="/login?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </>
      }
    />
  );
}
