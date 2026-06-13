// "Order ready" alerts for the customer status page. Everything here is
// best-effort and browser-gated, layered as progressive enhancement:
//
//   1. Title flash + chime  — work in any browser while the tab is open.
//   2. Web Notification API — a system popup that also reaches the customer
//      when the tab is backgrounded. Supported on desktop + Android Chrome
//      (with granted permission). iOS Safari only exposes it inside an
//      installed PWA, so a normal tab feature-detects to false and we degrade
//      to (1) silently.
//
// Permission is requested only from an explicit user gesture (a "Notify me"
// tap), never auto-prompted on load — the web.dev "just-in-time / double
// opt-in" guidance, which keeps grant rates high and avoids a hard block.

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

export function fireReadyNotification(
  boothName: string,
  orderNumber: string,
): void {
  if (!isNotifySupported() || Notification.permission !== "granted") return;
  try {
    new Notification(`Order #${orderNumber} is ready`, {
      body: `${boothName} — please collect it now.`,
      // Same tag coalesces repeats into one popup if the effect re-fires.
      tag: `qkit-order-${orderNumber}`,
    });
  } catch {
    // Some engines throw when constructed outside a service worker — ignore.
  }
}

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioCtor }).webkitAudioContext
  );
}

// Short rising two-note chime. Must follow a user gesture (placing the order /
// tapping "Notify me") or the AudioContext stays suspended — silent no-op on
// any failure. Returns true if it managed to schedule sound.
export function playReadyChime(): boolean {
  const Ctor = audioCtor();
  if (!Ctor) return false;
  try {
    const ctx = new Ctor();
    void ctx.resume?.();
    const start = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const at = start + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.18);
    });
    return true;
  } catch {
    return false;
  }
}
