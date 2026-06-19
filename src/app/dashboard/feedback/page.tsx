import { FeedbackForm } from "@/components/feedback-form";

export const revalidate = 0;

export default function DashboardFeedbackPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Help shape QKit
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Feedback
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          What&apos;s working, what&apos;s missing, what&apos;s broken? We read
          every note.
        </p>
      </div>
      <FeedbackForm source="vendor" prompt="How's QKit working for you?" />
    </div>
  );
}
