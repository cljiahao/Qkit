import { Ticket } from "@/components/ticket";
import { InfoTooltip } from "@/components/info-tooltip";

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
    <Ticket as="section" className="mb-5 break-inside-avoid-column px-6 py-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          {eyebrow && (
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-xl font-semibold leading-tight">
              {title}
            </h2>
            {tooltip && (
              <InfoTooltip label="More about this section">
                {tooltip}
              </InfoTooltip>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </Ticket>
  );
}
