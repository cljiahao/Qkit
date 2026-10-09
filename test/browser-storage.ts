import { vi } from "vitest";

/** Minimal storage fixture for node tests that do not need a DOM. */
export function installBrowserStorage(kind: "localStorage" | "sessionStorage") {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
  vi.stubGlobal("window", { [kind]: storage });
  vi.stubGlobal(kind, storage);
  return storage;
}
