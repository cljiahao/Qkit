import { cn } from "@/lib/utils";

export function ElevatedCard({
  as: As = "div",
  className,
  children,
  ...props
}: {
  as?: "div" | "section" | "li";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={cn(
        "rounded-[20px] border bg-card shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]",
        className,
      )}
      {...props}
    >
      {children}
    </As>
  );
}
