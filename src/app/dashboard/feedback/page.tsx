import { FeedbackForm } from "@/components/feedback-form";
import { PageHeader } from "@/components/page-header";

export const revalidate = 0;

export default function DashboardFeedbackPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <PageHeader eyebrow="Help shape qkit" title="Feedback">
          What&apos;s working, what&apos;s missing, what&apos;s broken? We read
          every note.
        </PageHeader>
      </div>
      <FeedbackForm
        source="vendor"
        metric="nps"
        prompt="How likely are you to recommend qkit to another vendor?"
      />
    </div>
  );
}
