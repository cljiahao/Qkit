/** Explicit test credentials keep integration suites away from application secrets. */
export function integrationDbEnv() {
  const url = process.env.QKIT_TEST_SUPABASE_URL;
  const secret = process.env.QKIT_TEST_SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "Set QKIT_TEST_SUPABASE_URL and QKIT_TEST_SUPABASE_SECRET_KEY for an isolated test database",
    );
  }
  return { url, secret };
}
