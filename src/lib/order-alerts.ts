// "Order ready" alerts. Best-effort, browser-gated progressive enhancement:
//
//   1. Title flash + chime  — work in any browser while the tab is open, once
//      audio has been unlocked by a user gesture (see unlockAudio).
//   2. Notification          — a system popup shown via the service worker
//      (registration.showNotification). Reaches the customer when the tab is
//      backgrounded. Works on desktop + Android Chrome with granted permission,
//      and on iOS only inside an installed PWA. A normal iOS Safari tab has no
//      Notification API, so it feature-detects to false and degrades to (1).
//
// Permission is requested only from an explicit user gesture, never auto-prompted
// on load (web.dev "just-in-time / double opt-in" guidance).

import type { SoundId } from "@/lib/types";

export function isNotifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyPermission(): NotificationPermission | null {
  return isNotifySupported() ? Notification.permission : null;
}

export async function requestNotifyPermission(): Promise<NotificationPermission | null> {
  if (!isNotifySupported()) return null;
  try {
    return await Notification.requestPermission();
  } catch {
    return null;
  }
}

/**
 * Show a system popup. Prefers the service worker's showNotification (the only
 * form Android Chrome allows — the page-level `new Notification()` constructor
 * throws there); falls back to the constructor on desktop, where it still
 * works without a controlling SW. Silent no-op if both paths fail.
 */
async function showNotification(
  title: string,
  options: NotificationOptions,
): Promise<void> {
  // SW path — required on Android Chrome. `controller` set means an active SW is
  // controlling this page, so `ready` resolves immediately (it would hang if no
  // SW were ever registered).
  const sw =
    typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (sw?.controller) {
    try {
      const reg = await sw.ready;
      await reg.showNotification(title, options);
      return;
    } catch {
      // fall through to the page-level constructor
    }
  }

  try {
    new Notification(title, options);
  } catch {
    // Page-level constructor is illegal on some engines (Android Chrome) — ignore.
  }
}

/** "Your order is ready" popup for the customer status page. */
export async function fireReadyNotification(
  boothName: string,
  orderNumber: string,
  url?: string,
): Promise<void> {
  if (!isNotifySupported() || Notification.permission !== "granted") return;
  await showNotification(`Order #${orderNumber} is ready`, {
    body: `${boothName} — please collect it now.`,
    // Same tag coalesces repeats into one popup if the effect re-fires.
    tag: `qkit-order-${orderNumber}`,
    data: { url: url ?? "/" },
  });
}

/**
 * "New order" popup for the vendor board (opt-in via board_settings.desktop_notify,
 * only fired while the tab is backgrounded — see realtime-order-board.tsx).
 */
export async function fireNewOrderNotification(
  boothName: string,
  orderNumber: string,
  url?: string,
): Promise<void> {
  if (!isNotifySupported() || Notification.permission !== "granted") return;
  await showNotification(`New order #${orderNumber}`, {
    body: `${boothName} — tap to view.`,
    tag: `qkit-new-order-${orderNumber}`,
    data: { url: url ?? "/dashboard" },
  });
}

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioCtor }).webkitAudioContext
  );
}

// One shared AudioContext, cached on `window`. Mobile (iOS Safari, Android
// Chrome) starts a context `suspended` and only lets a user gesture resume it;
// a context created per-chime outside a gesture stays silent. Reusing the one
// unlocked context is what makes the later (non-gesture) "ready" chime audible.
// Storing it on `window` also keeps tests isolated — stubbing window drops it.
function sharedCtx(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  const w = window as Window & { __qkitAudioCtx?: AudioContext };
  if (!w.__qkitAudioCtx) {
    try {
      w.__qkitAudioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return w.__qkitAudioCtx;
}

/** Create + resume the shared AudioContext. Call from a user gesture (tap). */
export function unlockAudio(): void {
  const ctx = sharedCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume?.();
}

// Schedules a sequence of notes on the shared context — the engine behind
// every board sound preset. Triangle waves carry more harmonics than sine, so
// they read louder at the same gain. Awaits resume first so a context
// suspended by backgrounding wakes before the notes are scheduled. Returns
// true if it scheduled sound, false on any failure.
function playNotes(notes: number[], noteDuration: number): Promise<boolean> {
  const ctx = sharedCtx();
  if (!ctx) return Promise.resolve(false);
  return (async () => {
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const start = ctx.currentTime;
      notes.forEach((freq, i) => {
        const at = start + i * NOTE_SPACING;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + noteDuration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + noteDuration + 0.02);
      });
      return true;
    } catch {
      return false;
    }
  })();
}

// seconds between note onsets (no overlap → no clip)
const NOTE_SPACING = 0.2;
const NOTE_DURATION = 0.22;
const PEAK_GAIN = 0.32;

// G5 · C6 · E6 (major triad), rising, then the triad again. ~1.2s total — loud
// and long enough to catch a customer/vendor not staring at the screen.
const CHIME_NOTES = [784, 1047, 1319, 784, 1047, 1319];
// Single low tone, longer decay — a plainer, less "arcade" alert.
const BELL_NOTES = [523];
const BELL_DURATION = 0.9;

export async function playReadyChime(): Promise<boolean> {
  return playNotes(CHIME_NOTES, NOTE_DURATION);
}

/** Play a vendor's chosen new-order sound preset. "none" is a silent no-op. */
export async function playSound(soundId: SoundId): Promise<boolean> {
  switch (soundId) {
    case "chime":
      return playNotes(CHIME_NOTES, NOTE_DURATION);
    case "bell":
      return playNotes(BELL_NOTES, BELL_DURATION);
    case "none":
      return true;
  }
}
