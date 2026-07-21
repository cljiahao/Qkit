import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// The shared (i)-trigger shape every "one more sentence of explanation" spot
// in the app uses instead of a bordered helper paragraph — a field label, a
// Section title (see ticket-section.tsx), a switch caption.
export function InfoTooltip({
  children,
  label = "More about this setting",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className="text-muted-foreground hover:text-foreground"
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
