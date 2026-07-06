"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitSupportMessage } from "@/app/actions/support";
import type { SupportMessageInput } from "@/lib/schemas";

const CATEGORIES: { value: SupportMessageInput["category"]; label: string }[] =
  [
    { value: "pass", label: "Event pass" },
    { value: "payment", label: "Payment" },
    { value: "pro", label: "Pro / billing" },
    { value: "other", label: "Something else" },
  ];

/**
 * Vendor → admin help request. Pick what it's about, say what's wrong; the admin
 * picks it up in their dashboard. Sits in a Sheet off the account menu, mirroring
 * the feedback widget.
 */
export function SupportForm() {
  const [category, setCategory] =
    useState<SupportMessageInput["category"]>("pass");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function send() {
    if (!body.trim()) {
      toast.error("Tell us what's wrong");
      return;
    }
    start(async () => {
      const res = await submitSupportMessage({ category, body: body.trim() });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
        Got it — we&apos;ll look into this and follow up. 🙏
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="mb-2 text-sm font-medium">What&apos;s it about?</p>
        <div
          className="grid grid-cols-2 gap-1.5"
          role="radiogroup"
          aria-label="What's it about?"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={category === c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                category === c.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Describe the problem"
        placeholder="What happened? The more detail, the faster we can help."
        rows={4}
        maxLength={2000}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <Button
        type="button"
        className="h-11 w-full rounded-xl font-semibold"
        onClick={send}
        disabled={pending}
      >
        {pending ? "Sending…" : "Send message"}
      </Button>
    </div>
  );
}
