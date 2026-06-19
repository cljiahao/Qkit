"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitFeedback } from "@/app/actions/feedback";

interface Props {
  source: "customer" | "vendor";
  boothId?: string;
  orderNumber?: string;
  prompt?: string;
}

/** Compact rating + message feedback widget → feedback table (admin reads). */
export function FeedbackForm({ source, boothId, orderNumber, prompt }: Props) {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function send() {
    if (!rating && !message.trim()) {
      toast.error("Add a rating or a message");
      return;
    }
    start(async () => {
      const res = await submitFeedback({
        source,
        boothId,
        orderNumber,
        rating: rating || undefined,
        message: message.trim() || undefined,
      });
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
        Thanks for the feedback — it helps us improve. 🙏
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium">{prompt ?? "How was it?"}</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-secondary"
          >
            <Star
              className={cn(
                "size-6",
                n <= rating
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Anything we can improve? (optional)"
        rows={3}
        maxLength={2000}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <Button
        type="button"
        className="h-11 w-full rounded-xl font-semibold"
        onClick={send}
        disabled={pending}
      >
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </div>
  );
}
