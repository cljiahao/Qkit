"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Clock, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncAction } from "@/hooks/use-async-action";
import { boardSettingsSchema } from "@/lib/schemas";
import {
  isNotifySupported,
  notifyPermission,
  playSound,
  requestNotifyPermission,
  unlockAudio,
} from "@/lib/order-alerts";
import { cn } from "@/lib/utils";
import type { BoardSettings, SoundId } from "@/lib/types";
import { updateBoardSettings } from "./actions";

const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "chime", label: "Chime" },
  { id: "bell", label: "Bell" },
  { id: "ding", label: "Ding" },
  { id: "horn", label: "Horn" },
  { id: "triple", label: "Triple beep" },
  { id: "none", label: "Off" },
];

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const errorClass = "text-sm font-medium text-destructive";

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ticket mb-5 break-inside-avoid-column overflow-hidden rounded-2xl border border-border px-6 py-6 shadow-[0_2px_0_0_var(--color-border)]">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold leading-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export function SettingsForm({ initial }: { initial: BoardSettings }) {
  const router = useRouter();
  const [agingMin, setAgingMin] = useState(String(initial.aging_min));
  const [overdueMin, setOverdueMin] = useState(String(initial.overdue_min));
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const { pending: savingThresholds, run: runThresholds } = useAsyncAction();

  const [soundId, setSoundId] = useState<SoundId>(initial.sound_id);
  const { pending: savingSound, run: runSound } = useAsyncAction();

  const [desktopNotify, setDesktopNotify] = useState(initial.desktop_notify);
  const { pending: savingNotify, run: runNotify } = useAsyncAction();

  function saveThresholds() {
    const parsed = boardSettingsSchema.safeParse({
      aging_min: Number(agingMin),
      overdue_min: Number(overdueMin),
      sound_id: soundId,
      desktop_notify: desktopNotify,
    });
    if (!parsed.success) {
      setThresholdError(
        parsed.error.issues[0]?.message ?? "Check the thresholds",
      );
      return;
    }
    setThresholdError(null);
    return runThresholds(async () => {
      const res = await updateBoardSettings(parsed.data);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Thresholds saved");
      router.refresh();
    });
  }

  function chooseSound(id: SoundId) {
    setSoundId(id);
    // Play it right on click — a separate "switch, then press Preview" step
    // is one tap too many just to hear what you picked.
    unlockAudio();
    void playSound(id);
    return runSound(async () => {
      const res = await updateBoardSettings({
        aging_min: Number(agingMin),
        overdue_min: Number(overdueMin),
        sound_id: id,
        desktop_notify: desktopNotify,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleDesktopNotify() {
    return runNotify(async () => {
      const next = !desktopNotify;
      if (next) {
        // Gesture-gated — this click is the only reliable moment to unlock
        // audio + ask permission (web.dev double-opt-in guidance).
        unlockAudio();
        if (isNotifySupported()) {
          const result = await requestNotifyPermission();
          if (result !== "granted") {
            toast.error(
              "Notifications blocked — enable them for this site in your browser settings, then try again.",
            );
            return;
          }
        } else {
          toast.error("Your browser doesn't support desktop notifications.");
          return;
        }
      }
      setDesktopNotify(next);
      const res = await updateBoardSettings({
        aging_min: Number(agingMin),
        overdue_min: Number(overdueMin),
        sound_id: soundId,
        desktop_notify: next,
      });
      if (!res.success) {
        toast.error(res.error);
        setDesktopNotify(!next);
        return;
      }
      toast.success(next ? "Notifications on" : "Notifications off");
      router.refresh();
    });
  }

  const thresholdsUnchanged =
    agingMin === String(initial.aging_min) &&
    overdueMin === String(initial.overdue_min) &&
    soundId === initial.sound_id;

  return (
    <div className="lg:columns-2 lg:gap-5">
      <Section
        icon={<Clock className="size-5" />}
        title="Attention thresholds"
        description="How long before a waiting ticket flags itself on the board."
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="aging-min" className={labelClass}>
              Turn amber after
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="aging-min"
                type="number"
                min={1}
                max={240}
                value={agingMin}
                onChange={(e) => setAgingMin(e.target.value)}
                className="h-11 rounded-xl"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="overdue-min" className={labelClass}>
              Turn red after
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="overdue-min"
                type="number"
                min={1}
                max={240}
                value={overdueMin}
                onChange={(e) => setOverdueMin(e.target.value)}
                className="h-11 rounded-xl"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>
        </div>
        {thresholdError && <p className={errorClass}>{thresholdError}</p>}
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveThresholds}
            disabled={savingThresholds || thresholdsUnchanged}
            className="h-10 rounded-xl font-semibold"
          >
            {savingThresholds ? "Saving…" : "Save thresholds"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<Volume2 className="size-5" />}
        title="New-order sound"
        description="Plays when an order lands while this tab is open."
      >
        <div
          role="radiogroup"
          aria-label="New-order sound"
          className="grid grid-cols-3 gap-2"
        >
          {SOUND_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={soundId === opt.id}
              onClick={() => chooseSound(opt.id)}
              disabled={savingSound}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                soundId === opt.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        icon={<Bell className="size-5" />}
        title="Notifications"
        description="A popup for a new order when this tab is backgrounded. Works on Android and desktop browsers — on iPhone/iPad, add QKit to your Home Screen first (a regular Safari tab can't show these)."
      >
        <button
          type="button"
          aria-pressed={desktopNotify}
          onClick={toggleDesktopNotify}
          disabled={savingNotify}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
            desktopNotify
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
              : "border-destructive/40 bg-destructive/[0.05] text-destructive",
          )}
        >
          {desktopNotify ? "On" : "Off"}
        </button>
        {desktopNotify && notifyPermission() !== "granted" && (
          <p className="text-xs text-muted-foreground">
            Permission isn&apos;t granted in this browser — this device
            won&apos;t show popups until you re-enable it here.
          </p>
        )}
      </Section>
    </div>
  );
}
