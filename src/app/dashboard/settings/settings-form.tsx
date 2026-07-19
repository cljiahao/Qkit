"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Clock, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Section } from "@/components/ticket-section";
import { useAsyncAction } from "@/hooks/use-async-action";
import { boardSettingsSchema } from "@/lib/schemas";
import {
  isNotifySupported,
  notifyPermission,
  playSound,
  requestNotifyPermission,
  unlockAudio,
} from "@/lib/order-alerts";
import { cn, FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";
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

export function SettingsForm({ initial }: { initial: BoardSettings }) {
  const router = useRouter();
  const [agingMin, setAgingMin] = useState(String(initial.aging_min));
  const [overdueMin, setOverdueMin] = useState(String(initial.overdue_min));
  const [undoSeconds, setUndoSeconds] = useState(String(initial.undo_seconds));
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
      undo_seconds: Number(undoSeconds),
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
        undo_seconds: Number(undoSeconds),
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
              "Notifications blocked. Enable them for this site in your browser settings, then try again.",
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
        undo_seconds: Number(undoSeconds),
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
    undoSeconds === String(initial.undo_seconds);

  return (
    <div className="md:columns-2 md:gap-5">
      <Section
        icon={<Clock className="size-5" />}
        title="Board timing"
        description="How long before a waiting ticket flags itself, and how long staff have to undo an accidental Mark Ready / Mark Picked Up tap."
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="aging-min" className={FORM_LABEL_CLASS}>
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
                aria-invalid={!!thresholdError}
                aria-describedby={
                  thresholdError ? "threshold-error" : undefined
                }
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="overdue-min" className={FORM_LABEL_CLASS}>
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
                aria-invalid={!!thresholdError}
                aria-describedby={
                  thresholdError ? "threshold-error" : undefined
                }
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="undo-seconds" className={FORM_LABEL_CLASS}>
              Advance undo window
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="undo-seconds"
                type="number"
                min={2}
                max={15}
                value={undoSeconds}
                onChange={(e) => setUndoSeconds(e.target.value)}
                className="h-11 rounded-xl"
                aria-invalid={!!thresholdError}
                aria-describedby={
                  thresholdError ? "threshold-error" : undefined
                }
              />
              <span className="text-sm text-muted-foreground">sec</span>
            </div>
          </div>
        </div>
        {thresholdError && (
          <p id="threshold-error" className={FORM_ERROR_CLASS}>
            {thresholdError}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveThresholds}
            disabled={savingThresholds || thresholdsUnchanged}
            className="h-10 rounded-xl font-semibold"
          >
            {savingThresholds ? "Saving…" : "Save timing"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<Volume2 className="size-5" />}
        title="New-order sound"
        description="Plays when an order lands while this tab is open."
      >
        <ToggleGroup
          type="single"
          value={soundId}
          onValueChange={(v) => v && chooseSound(v as SoundId)}
          disabled={savingSound}
          spacing={2}
          aria-label="New-order sound"
          className="grid grid-cols-3"
        >
          {SOUND_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt.id}
              value={opt.id}
              className={cn(
                "rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5",
                "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary",
              )}
            >
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section
        icon={<Bell className="size-5" />}
        title="Notifications"
        description="A popup for a new order when this tab is backgrounded. Works on Android and desktop browsers. On iPhone or iPad, add qkit to your Home Screen first, since a regular Safari tab can't show these."
      >
        <div className="flex items-center gap-3">
          <Switch
            checked={desktopNotify}
            onCheckedChange={toggleDesktopNotify}
            disabled={savingNotify}
            aria-label="Desktop notifications"
          />
          <span
            className={cn(
              "text-sm font-semibold",
              desktopNotify ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {desktopNotify ? "On" : "Off"}
          </span>
        </div>
        {desktopNotify && notifyPermission() !== "granted" && (
          <p className="text-xs text-muted-foreground">
            Permission isn&apos;t granted in this browser. This device
            won&apos;t show popups until you re-enable it here.
          </p>
        )}
      </Section>
    </div>
  );
}
