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
  // "stars" = 1–5 (customer order rating); "nps" = 0–10 recommend score
  // (vendor → QKit loyalty). Defaults to stars.
  metric?: "stars" | "nps";
}

/** Compact rating/NPS + message feedback widget → feedback table. */
export function FeedbackForm({
  source,
  boothId,
  orderNumber,
  prompt,
  metric = "stars",
}: Props) {
  // For stars: 1–5, 0 = unset. For NPS: 0–10, -1 = unset (0 is a valid score).
  const [score, setScore] = useState(metric === "nps" ? -1 : 0);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const hasScore = metric === "nps" ? score >= 0 : score > 0;

  function send() {
    if (!hasScore && !message.trim()) {
      toast.error(
        metric === "nps"
          ? "Pick a score or leave a note"
          : "Add a rating or a message",
      );
      return;
    }
    start(async () => {
      const res = await submitFeedback({
        source,
        boothId,
        orderNumber,
        rating: metric === "stars" && score > 0 ? score : undefined,
        nps: metric === "nps" && score >= 0 ? score : undefined,
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
      {metric === "nps" ? (
        <>
          <div
            className="grid grid-cols-11 gap-1"
            role="radiogroup"
            aria-label="Recommend score, 0 to 10"
          >
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                aria-label={`${n}`}
                onClick={() => setScore(n)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-colors",
                  score === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:bg-primary/5",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
        </>
      ) : (
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => setScore(n)}
              className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-secondary"
            >
              <Star
                className={cn(
                  "size-6",
                  n <= score
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>
      )}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        aria-label={prompt ?? "Your feedback"}
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
