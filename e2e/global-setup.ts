import { PAYKIT_MOCK_PORT, startPaykitMock } from "./paykit-mock";

// Runs once in the Playwright runner process before the webServer's `pnpm dev`
// is confirmed ready and before any test runs. The mock listens on a fixed
// local port (PAYKIT_MOCK_PORT) that playwright.config.ts's webServer.env
// points NEXT_PUBLIC_PAYKIT_URL at, so the two order specs that render the
// pay panel (customer-order.spec.ts, order-code.spec.ts's booth render) hit
// this instead of a real paykit deployment. The returned function is used by
// Playwright as the matching global teardown.
export default async function globalSetup() {
  const { server, close } = startPaykitMock();
  await new Promise<void>((resolve) => {
    server.listen(PAYKIT_MOCK_PORT, "127.0.0.1", resolve);
  });
  return close;
}
