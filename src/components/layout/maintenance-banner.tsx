/**
 * Site-wide informational banner (never blocks anything underneath). Renders
 * nothing when disabled or when the message is blank, so a stray enabled-but-
 * empty row never shows an empty bar to every visitor.
 */
export function MaintenanceBanner({
  enabled,
  message,
}: {
  enabled: boolean;
  message: string;
}) {
  if (!enabled || !message.trim()) return null;
  return (
    <div
      role="status"
      className="w-full bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-800 dark:text-amber-200"
    >
      {message}
    </div>
  );
}
