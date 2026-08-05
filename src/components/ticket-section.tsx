import { Section as SharedSection } from "@merqo/ui";
import { Ticket } from "@/components/ticket";

export function Section({
  icon,
  eyebrow,
  title,
  description,
  tooltip,
  children,
}: {
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  // Extra detail that doesn't need to be visible by default — rendered
  // behind an (i) next to the title instead of bloating `description`.
  tooltip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SharedSection
      icon={icon}
      eyebrow={eyebrow}
      title={title}
      description={description}
      tooltip={tooltip}
      wrapper={(content) => (
        <Ticket
          as="section"
          className="mb-5 break-inside-avoid-column px-6 py-6"
        >
          {content}
        </Ticket>
      )}
    >
      {children}
    </SharedSection>
  );
}
