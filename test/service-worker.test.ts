import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());
const origin = "https://qkit.example";
const orderUrl = `${origin}/order/booth/0042?token=fixture`;

type WindowClient = {
  url: string;
  focus?: () => Promise<void>;
  navigate?: (url: string) => Promise<WindowClient | null>;
};
type ClickEvent = {
  notification: { data?: { url?: unknown }; close: () => void };
  waitUntil: (pending: Promise<void>) => void;
};

async function worker(clients: WindowClient[] = [], canOpen = true) {
  const handlers = new Map<string, (event: ClickEvent) => void>();
  const matchAll = vi.fn(async () => clients);
  const openWindow = vi.fn(async () => undefined);
  const skipWaiting = vi.fn();
  const claim = vi.fn(async (): Promise<void> => undefined);
  vi.resetModules();
  vi.stubGlobal("self", {
    location: { origin },
    skipWaiting,
    addEventListener: (name: string, callback: (event: ClickEvent) => void) =>
      handlers.set(name, callback),
    clients: {
      matchAll,
      claim,
      openWindow: canOpen ? openWindow : undefined,
    },
  });
  const workerModule = "../public/sw.js";
  await import(workerModule);
  async function dispatch(name: string, url?: unknown) {
    const close = vi.fn();
    const pending: Promise<void>[] = [];
    const handler = handlers.get(name);
    if (!handler) throw new Error(`${name} handler missing`);
    handler({
      notification: { data: url === undefined ? undefined : { url }, close },
      waitUntil: (task) => pending.push(task),
    });
    await Promise.all(pending);
    return close;
  }
  return {
    click: (url?: unknown) => dispatch("notificationclick", url),
    install: () => dispatch("install"),
    activate: () => dispatch("activate"),
    matchAll,
    openWindow,
    skipWaiting,
    claim,
  };
}

describe("service-worker notification navigation", () => {
  it("activates the new worker immediately on installation", async () => {
    const sw = await worker();
    await sw.install();
    expect(sw.skipWaiting).toHaveBeenCalledOnce();
    expect(sw.claim).not.toHaveBeenCalled();
  });

  it("waits for activation to claim existing pages", async () => {
    const sw = await worker();
    let resolveClaim: (() => void) | undefined;
    sw.claim.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveClaim = resolve;
        }),
    );
    let finished = false;
    const activation = sw.activate().then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(sw.claim).toHaveBeenCalledOnce();
    expect(finished).toBe(false);
    if (!resolveClaim) throw new Error("claim was not started");
    resolveClaim();
    await activation;
    expect(finished).toBe(true);
  });

  it("focuses the target order rather than an earlier dashboard tab", async () => {
    const dashboardFocus = vi.fn(async () => undefined);
    const orderFocus = vi.fn(async () => undefined);
    const sw = await worker([
      { url: `${origin}/dashboard`, focus: dashboardFocus },
      { url: orderUrl, focus: orderFocus },
    ]);
    const close = await sw.click("/order/booth/0042?token=fixture");
    expect(close).toHaveBeenCalledOnce();
    expect(sw.matchAll).toHaveBeenCalledWith({
      type: "window",
      includeUncontrolled: true,
    });
    expect(orderFocus).toHaveBeenCalledOnce();
    expect(dashboardFocus).not.toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("opens the exact order URL when only another order is open", async () => {
    const otherFocus = vi.fn(async () => undefined);
    const sw = await worker([
      { url: `${origin}/order/booth/0041`, focus: otherFocus },
    ]);
    await sw.click(orderUrl);
    expect(otherFocus).not.toHaveBeenCalled();
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith(orderUrl);
  });

  it("opens the target when a matching client cannot focus", async () => {
    const sw = await worker([{ url: orderUrl }]);
    await sw.click(orderUrl);
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith(orderUrl);
  });

  it("navigates a matching client before focusing its destination", async () => {
    const staleFocus = vi.fn(async () => undefined);
    const destinationFocus = vi.fn(async () => undefined);
    const navigate = vi.fn(async () => ({
      url: orderUrl,
      focus: destinationFocus,
    }));
    const sw = await worker([{ url: orderUrl, focus: staleFocus, navigate }]);
    await sw.click(orderUrl);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(orderUrl);
    expect(destinationFocus).toHaveBeenCalledOnce();
    expect(navigate.mock.invocationCallOrder[0]).toBeLessThan(
      destinationFocus.mock.invocationCallOrder[0],
    );
    expect(staleFocus).not.toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("opens the target if the matching client disappears during navigation", async () => {
    const focus = vi.fn(async () => undefined);
    const navigate = vi.fn(async () => null);
    const sw = await worker([{ url: orderUrl, focus, navigate }]);
    await sw.click(orderUrl);
    expect(focus).not.toHaveBeenCalled();
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith(orderUrl);
  });

  it("opens the target after a matching client's navigation fails", async () => {
    const focus = vi.fn(async () => undefined);
    const navigate = vi.fn(async () => {
      throw new Error("tab closed");
    });
    const sw = await worker([{ url: orderUrl, focus, navigate }]);
    await sw.click(orderUrl);
    expect(focus).not.toHaveBeenCalled();
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith(orderUrl);
  });

  it("opens the target after a matching client's focus fails", async () => {
    const focus = vi.fn(async () => {
      throw new Error("tab closed");
    });
    const sw = await worker([{ url: orderUrl, focus }]);
    await sw.click(orderUrl);
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith(orderUrl);
  });

  it("falls back to the same-origin homepage without URL data", async () => {
    const sw = await worker();
    await sw.click();
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith(`${origin}/`);
  });

  it.each([
    "https://attacker.example/order",
    "//attacker.example/order",
    "javascript:alert(1)",
    "data:text/html,fixture",
    "https://[invalid",
    "https://user:fixture@qkit.example/order",
  ])("closes but never navigates to an unsafe URL: %s", async (url) => {
    const sw = await worker();
    const close = await sw.click(url);
    expect(close).toHaveBeenCalledOnce();
    expect(sw.matchAll).not.toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("finishes safely when opening windows is unavailable", async () => {
    const sw = await worker([], false);
    await expect(sw.click(orderUrl)).resolves.toBeDefined();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });
});
