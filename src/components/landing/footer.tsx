import Link from "next/link";
import { LegalFooterLinks } from "@merqo/ui";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row">
        {/* Plain <a>, not Link — see nav.tsx's wordmark comment: a same-page
            hash jump needs a native anchor so the URL bar's hash always
            updates, which Link doesn't reliably do when only the fragment
            changes. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/#top"
          aria-label="qkit home, back to top"
          className="font-display text-xl font-semibold text-foreground transition-opacity hover:opacity-80"
        >
          <span className="text-primary">Q</span>Kit
        </a>
        <span>Built for booths. Made in Singapore.</span>
        <span className="text-xs">© 2026 qkit · a Merqo kit</span>
        <Link href="/about" className="hover:text-foreground">
          About
        </Link>
        <LegalFooterLinks />
        <Link href="/login" className="hover:text-foreground">
          Vendor sign in →
        </Link>
      </div>
    </footer>
  );
}
