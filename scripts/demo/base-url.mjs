/** Restrict synthetic demo writes to a loopback app origin. */
export function localDemoBaseUrl(value = "http://localhost:3000") {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "DEMO_BASE_URL must be a loopback HTTP(S) origin without credentials or a path",
    );
  }
  return url.origin;
}
