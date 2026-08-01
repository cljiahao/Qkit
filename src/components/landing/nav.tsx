import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Nav({ authed }: { authed: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-5 py-4 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        {/* Plain <a>, not next/link's Link: this is a same-page hash jump
            (already on "/"), and Link doesn't reliably update the URL bar's
            hash when only the fragment changes — it scrolls but leaves the
            old hash showing. A native anchor always gets this right. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/#top"
          aria-label="qkit home, back to top"
          className="font-display inline-flex items-baseline gap-0.5 text-3xl font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="text-primary">Q</span>Kit
        </a>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden rounded-lg sm:inline-flex"
          >
            <a href="#faq">FAQ</a>
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
        </div>
      </nav>
    </header>
  );
}
