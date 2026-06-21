"use client";

import { useEffect } from "react";

/**
 * Registers the static service worker so order-ready notifications can be shown
 * via registration.showNotification (Android Chrome rejects the page-level
 * Notification constructor) and so the app is installable. Best-effort.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration can fail in private mode / unsupported engines — ignore.
    });
  }, []);
  return null;
}
