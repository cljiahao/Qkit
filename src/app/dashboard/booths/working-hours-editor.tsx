"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WeekdayKey } from "@/lib/tz";
import type { BoothHours, DayWindow } from "@/lib/hours";

const DAYS: { key: WeekdayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_WINDOW: DayWindow = { open: "09:00", close: "17:00" };

function emptyWeek(): Record<WeekdayKey, DayWindow | null> {
  return {
    mon: null,
    tue: null,
    wed: null,
    thu: null,
    fri: null,
    sat: null,
    sun: null,
  };
}

const timeInputClass =
  "h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function WorkingHoursEditor({
  value,
  onChange,
}: {
  value: BoothHours;
  onChange: (hours: BoothHours) => void;
}) {
  const [mode, setMode] = useState<"daily" | "weekly">(value?.mode ?? "daily");
  const [dailyOpen, setDailyOpen] = useState(
    value?.mode === "daily" ? value.open : "",
  );
  const [dailyClose, setDailyClose] = useState(
    value?.mode === "daily" ? value.close : "",
  );
  const [days, setDays] = useState<Record<WeekdayKey, DayWindow | null>>(
    value?.mode === "weekly" ? value.days : emptyWeek(),
  );

  function emitDaily(open: string, close: string) {
    setDailyOpen(open);
    setDailyClose(close);
    // Both blank -> no restriction (null). One blank -> still null until paired.
    onChange(open && close ? { mode: "daily", open, close } : null);
  }

  function emitWeek(next: Record<WeekdayKey, DayWindow | null>) {
    setDays(next);
    onChange({ mode: "weekly", days: next });
  }

  function goWeekly() {
    setMode("weekly");
    // Pre-fill every day with the current daily window so the vendor tweaks
    // rather than starts blank.
    const win: DayWindow =
      dailyOpen && dailyClose
        ? { open: dailyOpen, close: dailyClose }
        : DEFAULT_WINDOW;
    emitWeek({
      mon: win,
      tue: win,
      wed: win,
      thu: win,
      fri: win,
      sat: win,
      sun: win,
    });
  }

  function goDaily() {
    setMode("daily");
    const first = DAYS.map((d) => days[d.key]).find(Boolean) ?? null;
    const open = first?.open ?? dailyOpen;
    const close = first?.close ?? dailyClose;
    emitDaily(open, close);
  }

  function setDay(key: WeekdayKey, win: DayWindow | null) {
    emitWeek({ ...days, [key]: win });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Working hours</span>
      </div>

      {mode === "daily" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Opens</span>
            <input
              type="time"
              value={dailyOpen}
              onChange={(e) => emitDaily(e.target.value, dailyClose)}
              className={timeInputClass}
            />
            <span className="text-muted-foreground">Closes</span>
            <input
              type="time"
              value={dailyClose}
              onChange={(e) => emitDaily(dailyOpen, e.target.value)}
              className={timeInputClass}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Leave blank for no time limit. Customers can&apos;t order outside
            these hours. Closing before opening means an overnight window.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={goWeekly}
          >
            Set different hours per day
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const win = days[key];
            const open = win != null;
            return (
              <div key={key} className="flex flex-wrap items-center gap-2">
                <label className="flex w-32 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={open}
                    onChange={(e) =>
                      setDay(key, e.target.checked ? DEFAULT_WINDOW : null)
                    }
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  <span className="font-medium">{label}</span>
                </label>
                {open ? (
                  <div className="flex items-center gap-1.5 text-sm">
                    <input
                      type="time"
                      value={win.open}
                      onChange={(e) =>
                        setDay(key, { open: e.target.value, close: win.close })
                      }
                      className={timeInputClass}
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="time"
                      value={win.close}
                      onChange={(e) =>
                        setDay(key, { open: win.open, close: e.target.value })
                      }
                      className={timeInputClass}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 rounded-lg"
            onClick={goDaily}
          >
            Use same hours every day
          </Button>
        </div>
      )}
    </div>
  );
}
