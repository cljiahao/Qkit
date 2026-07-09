import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Consistent "leave this page" nav — a real button (proper hit target,
 * hover/focus state), not a plain text link that reads as body copy. */
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="rounded-lg">
      <Link href={href}>
        <ArrowLeft className="size-4" />
        {label}
      </Link>
    </Button>
  );
}
