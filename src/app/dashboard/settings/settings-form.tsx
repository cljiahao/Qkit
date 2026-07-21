"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Clock, Hourglass, Info, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

type PrepEstimate = {
  avgMinutes: number | null;
  sampleCount: number;
  minSample: number;
};

export function SettingsForm({
  initial,
  prepEstimate,
}: {
  initial: BoardSettings;
  prepEstimate: PrepEstimate;
}) {
  const router = useRouter();
  const [agingMin, setAgingMin] = useState(String(initial.aging_min));
  const [overdueMin, setOverdueMin] = useState(String(initial.overdue_min));
  const [undoSeconds, setUndoSeconds] = useState(String(initial.undo_seconds));
  const [readyAutoClearMin, setReadyAutoClearMin] = useState(
    initial.ready_auto_clear_min != null
      ? String(initial.ready_auto_clear_min)
      : "",
  );
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const { pending: savingThresholds, run: runThresholds } = useAsyncAction();

  const [soundId, setSoundId] = useState<SoundId>(initial.sound_id);
  const { pending: savingSound, run: runSound } = useAsyncAction();

  const [desktopNotify, setDesktopNotify] = useState(initial.desktop_notify);
  // Browser-level permission, separate from `desktop_notify` (the account
  // setting, synced across devices). Notification.permission doesn't itself
  // trigger a re-render, so this is tracked explicitly and only updated after
  // OUR OWN request calls — never re-read from the browser mid-render.
  const [permission, setPermission] = useState(() => notifyPermission());
  const { pending: savingNotify, run: runNotify } = useAsyncAction();

  const [dailyReset, setDailyReset] = useState(
    initial.daily_order_number_reset,
  );
  const [defaultPrepMin, setDefaultPrepMin] = useState(
    initial.default_prep_minutes != null
      ? String(initial.default_prep_minutes)
      : "",
  );
  const [displayError, setDisplayError] = useState<string | null>(null);
  const { pending: savingDisplay, run: runDisplay } = useAsyncAction();

  // Every save writes the FULL BoardSettings shape (it's one JSONB blob) —
  // each section's handler carries the other sections' current values along
  // so it doesn't clobber them.
  function currentSettings() {
    return {
      aging_min: Number(agingMin),
      overdue_min: Number(overdueMin),
      sound_id: soundId,
      desktop_notify: desktopNotify,
      undo_seconds: Number(undoSeconds),
      daily_order_number_reset: dailyReset,
      default_prep_minutes:
        defaultPrepMin.trim() === "" ? null : Number(defaultPrepMin),
      ready_auto_clear_min:
        readyAutoClearMin.trim() === "" ? null : Number(readyAutoClearMin),
    };
  }

  function saveThresholds() {
    const parsed = boardSettingsSchema.safeParse(currentSettings());
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
        ...currentSettings(),
        sound_id: id,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  // Gesture-gated — only ever called from a click, the one reliable moment
  // to unlock audio + ask permission (web.dev double-opt-in guidance).
  async function grantPermission(): Promise<boolean> {
    unlockAudio();
    if (!isNotifySupported()) {
      toast.error("Your browser doesn't support desktop notifications.");
      return false;
    }
    const result = await requestNotifyPermission();
    setPermission(result);
    if (result !== "granted") {
      toast.error(
        "Notifications blocked. Enable them for this site in your browser settings, then try again.",
      );
      return false;
    }
    return true;
  }

  function toggleDesktopNotify() {
    return runNotify(async () => {
      const next = !desktopNotify;
      if (next && !(await grantPermission())) return;
      setDesktopNotify(next);
      const res = await updateBoardSettings({
        ...currentSettings(),
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

  // Re-request browser permission without touching the (already-on) account
  // setting — the toggle above can't reach this path once desktopNotify is
  // already true, since clicking it there means turning OFF.
  function enableInBrowser() {
    return runNotify(async () => {
      if (await grantPermission()) {
        toast.success("Notifications enabled in this browser");
      }
    });
  }

  function saveDisplay() {
    const parsed = boardSettingsSchema.safeParse(currentSettings());
    if (!parsed.success) {
      setDisplayError(
        parsed.error.issues[0]?.message ?? "Check the wait estimate",
      );
      return;
    }
    setDisplayError(null);
    return runDisplay(async () => {
      const res = await updateBoardSettings(parsed.data);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Order display saved");
      router.refresh();
    });
  }

  const thresholdsUnchanged =
    agingMin === String(initial.aging_min) &&
    overdueMin === String(initial.overdue_min) &&
    undoSeconds === String(initial.undo_seconds) &&
    readyAutoClearMin ===
      (initial.ready_auto_clear_min != null
        ? String(initial.ready_auto_clear_min)
        : "");

  const displayUnchanged =
    dailyReset === initial.daily_order_number_reset &&
    defaultPrepMin ===
      (initial.default_prep_minutes != null
        ? String(initial.default_prep_minutes)
        : "");

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      {/* Two independent stacks, not a CSS grid: a grid's row tracks size to
          the tallest cell in that row, so once "Board timing" (col 1, three
          inputs) outgrew "New-order sound" (col 2, one row of buttons), row 2
          started late in BOTH columns — a gap over "Customer order screen"
          that had nothing to do with its own content. Each column stacking
          its own two sections avoids that row-sync entirely. */}
      <div className="flex flex-1 flex-col gap-5">
        <Section
          icon={<Clock className="size-5" />}
          title="Board timing"
          description="How fast a waiting ticket changes color, how long staff have to undo an accidental tap, and whether a forgotten ready order clears itself."
        >
          <div className="space-y-5">
            {/* Two groups, not one flat grid: amber/red are slow aging
                thresholds (minutes, how a ticket's colour drifts over
                time), undo/auto-clear are fast recovery timers (seconds
                and a short number of minutes, how quickly a mistake or a
                forgotten ticket resolves itself). Mixing all four in one
                unlabeled block read as an arbitrary pile of numbers. */}
            <div>
              <p className="mb-2 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                Ticket colour
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="aging-min" className={FORM_LABEL_CLASS}>
                      Turn amber after
                    </Label>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        aria-label="More about this setting"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Info className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-72 text-pretty">
                        Minutes after an order is placed before its ticket turns
                        amber, flagging it as starting to wait.
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="overdue-min" className={FORM_LABEL_CLASS}>
                      Turn red after
                    </Label>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        aria-label="More about this setting"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Info className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-72 text-pretty">
                        Minutes before a still-waiting ticket turns red instead
                        of amber. Must be later than the amber threshold.
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
              </div>
            </div>

            <div>
              <p className="mb-2 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                Quick timers
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="undo-seconds" className={FORM_LABEL_CLASS}>
                      Undo window
                    </Label>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        aria-label="More about this setting"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Info className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-72 text-pretty">
                        Mark Ready / Mark Picked Up applies right away. For this
                        many seconds after, the button turns into Undo instead,
                        in case of a wrong tap.
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label
                      htmlFor="ready-auto-clear-min"
                      className={FORM_LABEL_CLASS}
                    >
                      Auto-clear after
                    </Label>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        aria-label="More about this setting"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Info className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-72 text-pretty">
                        A ready order nobody marks Picked Up clears itself after
                        this many minutes. Leave blank to turn off. Restore a
                        wrongly-cleared order from Completed orders.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="ready-auto-clear-min"
                      type="number"
                      min={1}
                      max={60}
                      placeholder="Off"
                      value={readyAutoClearMin}
                      onChange={(e) => setReadyAutoClearMin(e.target.value)}
                      className="h-11 rounded-xl"
                      aria-invalid={!!thresholdError}
                      aria-describedby={
                        thresholdError ? "threshold-error" : undefined
                      }
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>
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
          icon={<Bell className="size-5" />}
          title="Notifications"
          description="A popup for a new order when this tab is backgrounded."
          tooltip={
            <>
              Works on Android and desktop browsers. On iPhone or iPad, add qkit
              to your Home Screen first (a regular Safari tab can&apos;t show
              these).
            </>
          }
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
          {desktopNotify && permission !== "granted" && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {isNotifySupported()
                  ? "Not allowed in this browser yet. This device won't show popups until you enable it."
                  : "Not supported in this browser. See above for iPhone/iPad."}
              </p>
              {isNotifySupported() && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={enableInBrowser}
                  disabled={savingNotify}
                  className="h-7 rounded-lg text-xs"
                >
                  Enable in this browser
                </Button>
              )}
            </div>
          )}
        </Section>
      </div>

      <div className="flex flex-1 flex-col gap-5">
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
          icon={<Hourglass className="size-5" />}
          title="Customer order screen"
          description="Two optional tweaks to what a customer sees right after ordering: a simpler order number, and a backup wait estimate."
        >
          <div className="flex items-center gap-3">
            <Switch
              checked={dailyReset}
              onCheckedChange={setDailyReset}
              aria-label="Show a simple daily order number instead of the permanent one"
            />
            <span className="flex items-center gap-1.5 text-sm font-medium">
              Simple daily order number
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-label="More about this setting"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent className="max-w-72 text-pretty">
                  Customers and staff see a small number like #3 instead of
                  #847. Records, receipts, and reports still use the permanent
                  number underneath.
                </TooltipContent>
              </Tooltip>
            </span>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="default-prep-min" className={FORM_LABEL_CLASS}>
                Backup prep time
              </Label>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-label="More about this setting"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent className="max-w-72 text-pretty">
                  Estimates a customer&apos;s wait until this booth has enough
                  of today&apos;s own order history. Leave blank to show queue
                  position instead.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="default-prep-min"
                type="number"
                min={1}
                max={60}
                placeholder="Not set"
                value={defaultPrepMin}
                onChange={(e) => setDefaultPrepMin(e.target.value)}
                className="h-11 w-28 rounded-xl"
                aria-invalid={!!displayError}
                aria-describedby={displayError ? "display-error" : undefined}
              />
              <span className="text-sm text-muted-foreground">
                min per order
              </span>
            </div>
            {prepEstimate.avgMinutes !== null ? (
              <p className="text-xs text-muted-foreground">
                Live right now: ~{Math.round(prepEstimate.avgMinutes)} min per
                order from your last {prepEstimate.sampleCount} orders. This
                backup isn&apos;t in use.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Not enough recent order history yet ({prepEstimate.sampleCount}{" "}
                of {prepEstimate.minSample} orders). Customers currently see{" "}
                {defaultPrepMin.trim() === ""
                  ? "their queue position"
                  : "this backup number"}{" "}
                instead.
              </p>
            )}
          </div>

          {displayError && (
            <p id="display-error" className={FORM_ERROR_CLASS}>
              {displayError}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={saveDisplay}
              disabled={savingDisplay || displayUnchanged}
              className="h-10 rounded-xl font-semibold"
            >
              {savingDisplay ? "Saving…" : "Save customer screen"}
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
