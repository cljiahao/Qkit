"use client";

import { Switch } from "@/components/ui/switch";

export function PrintingSection({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-sm">
        <span className="font-medium">Print via printkit</span>
        <span className="block text-muted-foreground">
          Auto-print a label for every QR order placed on this booth.
        </span>
      </span>
      <Switch
        checked={value}
        onCheckedChange={onChange}
        aria-label="Print via printkit"
      />
    </div>
  );
}
