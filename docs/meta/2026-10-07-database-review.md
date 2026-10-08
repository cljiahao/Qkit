# Database review, 2026-10-07

Scope: `supabase/` SQL, configuration, seeds and database tests, plus
`src/lib/types.ts`. Read AGENTS.md and docs/CONSTITUTION.md. No secrets,
build artifacts, remote databases or production data were accessed.

Pass one traced migration order, final table grants, RLS policies, public RPCs,
function replacements, cross-schema calls and type compatibility. Pass two
challenged the final state through alternate INSERT/RPC paths, concurrency,
public projections, seed reuse and missing negative tests. Historical function
copies are superseded by their last replacement; they are not independently
reported as live vulnerabilities. This is a source review, not evidence that
any hosted database has every checked-in migration applied.

## Verified findings and local fixes

- `supabase/migrations/0041_data_api_grants.sql:18` P1: authenticated INSERT
  on vendors includes plan. The final vendors_self_insert policy at
  `0039_rls_select_auth_uid.sql:23` checks only the caller's id. A newly signed-up
  caller without a vendor row can create their own row with plan='pro'. The
  UPDATE-only restriction in 0042 does not close INSERT. Fixed in 0095 by
  granting INSERT only on the legitimate onboarding/profile columns; ordinary
  id-only onboarding and service-role provisioning remain supported.
- `supabase/migrations/0087_payment_first_and_pickup.sql:89` P1: granting the
  SECURITY DEFINER number allocator to service_role does not revoke its
  default PUBLIC EXECUTE. A caller holding any existing order UUID can assign
  its number without the authorized payment-claim path. 0088 restricts direct
  UPDATE only. Fixed in 0095 by revoking PUBLIC/anon/authenticated execution.
- `supabase/migrations/0094_booth_daily_cup_cap.sql:11` P1: daily_cup_cap is
  added after 0091 narrowed booth UPDATE to an explicit column list, without
  its own UPDATE grant. saveBooth includes this field in every edit, so normal
  vendor booth edits can fail permission checks, even for a null cap. Fixed
  with the missing column grant in 0095, keeping the ownership RLS unchanged.
- `supabase/migrations/0087_payment_first_and_pickup.sql:277` P1: paid QR
  orders skip the sequence UPDATE that previously locked the booth before the
  stock check at line 285. Walkup and QR use different limiter keys, so they
  can both observe the same last item before either commits; QR windows can
  also differ at a minute boundary. Fixed in 0095 with an explicit booth row
  lock before stock reads. A two-session concurrency test remains required;
  sequential pgTAP coverage alone does not prove race safety.
- `supabase/migrations/0070_get_booth_for_order_vendor_profile_social_links.sql:45`
  P2: the anonymous projection removes only item.cost_cents, retaining private
  option_groups[].choices[].cost_delta_cents. The supplied coffee seeds
  include exactly that field. Fixed in 0095 by removing nested costs while
  preserving customer-facing option price deltas and all existing RPC keys.
- `supabase/migrations/0091_restrict_printkit_location_id_writes.sql:4` P2:
  printer identifiers are protected only against UPDATE. 0041's table INSERT
  grant lets a vendor supply printkit_location_id at booth creation. Fixed
  in 0095 with a column-scoped INSERT grant that excludes the server-owned id.
- `supabase/migrations/0058_platform_settings.sql:24` P2: the table was created
  after 0041's blanket service_role grants and receives only anon/authenticated
  SELECT. In a fresh deterministic schema, the service-role admin banner
  action cannot update it. RLS bypass does not grant SQL privileges. Fixed
  in 0095 with explicit service SELECT/INSERT/UPDATE.

These fixes are prepared, not deployed. New regression coverage is in
`supabase/tests/review-hardening.test.sql`. The migration preserves existing
rows and public RPC signatures. types.ts mirrors the newly added private
options validator; its type declaration does not grant callers execution.
Rollback should restore prior function bodies only if needed, retaining the
security ACL fixes. Reopening the exploitable grants is not a safe rollback.

## Additional findings closed in this review

- `supabase/migrations/0036_rate_limit_cleanup.sql:33` P2: public
  check_rate_limit accepts an arbitrary bucket key, window and limit, and
  writes under definer rights. An anonymous caller can consume another
  booth's order budget without placing an order, or create arbitrary rows.
  Fixed: the application limiter now creates its service client internally,
  and 0095 revokes public direct execution while preserving internal definer
  callers. RPC/factory errors fail open with a generic diagnostic that cannot
  echo private bucket keys; five focused unit tests cover the contract.
- `supabase/migrations/0071_vendor_feedback_convergence.sql:72` P2: possession
  of one real order token permits unlimited feedback inserts through the
  public RPC. The server action's rate limiter is bypassable through PostgREST;
  there is no RPC limiter or per-order uniqueness. A customer can overweight
  a vendor's ratings with repeated submissions. Fixed with a three-per-five-
  minute in-RPC bound keyed by validated order token. This preserves current
  multiple-review behavior; it does not introduce one-review-per-order semantics.
- `supabase/migrations/0087_payment_first_and_pickup.sql:228` P2: RPC cart
  validation verifies submitted options only when options is an array. It
  accepts a non-array options payload unchanged and does not enforce one
  selection per single-choice group. Because the JSON
  is persisted, malformed direct RPC orders can break code that expects
  SelectedOption[]. Fixed in both QR and walkup RPCs through the private
  validate_order_options helper: array and string-shape checks, maximum 20
  selections, no duplicate choices, at most one selection per single group.
  Omitted options remain valid because the existing Zod boundary explicitly
  permits them; there is no required-group field. Broader persistence JSON
  allowlisting is a separate improvement, not silently included here.
- `supabase/seed/coffee-cart-prod.sql:85` P2: the fixed global booth UUID and
  ON CONFLICT update of vendor_id transfer any existing demo booth to the next
  supplied vendor, including its orders. The script's idempotent/safe wording
  is false when reused across accounts. Fixed: conflict updates are scoped to
  the same owner and no longer assign vendor_id. A foreign-owned demo UUID is
  left untouched, with documented instructions to choose a different UUID.

## Final database boundary fixes

- `supabase/migrations/0005_events.sql:16` P2: events_public_insert intentionally
  accepts any row, and 0043 exposes it to anon. Direct Data API callers can
  forge vendor_id, event type, timestamps and unbounded metadata, bypassing
  the app action's schema/limiter. Do not trust this stream as authenticated
  business evidence. Fixed: direct anon/authenticated INSERT and the public
  insert policy are removed; logEvent uses the service client after its
  existing allowlist, metadata-size and rate checks. Accepted event behavior
  and best-effort failure handling are unchanged. The original pgTAP test
  now asserts direct denial, and the application regression asserts that
  normal validated events still insert through the service boundary.
- `supabase/migrations/0051_emit_order_completed.sql:14` P2: completion calls
  merqo.emit_metric unconditionally. The standalone local/CI schema lacks
  merqo, so a real completed transition fails there unless another harness
  creates a stub. Existing pgTAP status changes avoid completed, masking this
  integration boundary. Fixed in 0095: skip only an absent merqo.emit_metric
  routine. docs/DEPLOY.md requires the shared integration before 0051 and
  contains no best-effort promise, so errors from an installed routine still
  propagate with the original transaction semantics. Seven added regressions
  cover schema/routine absence, the original event payload, one-time emission,
  and an installed routine's failure/rollback.

## Remaining observations

Secondary observations: `booth_cups_today` exposes actual daily unit sales to
anon for any known booth UUID, although the public rationale documents only
remaining cups. `orders.id` and `source` are still writable despite identity
freeze comments. Audit table TRUNCATE remains in the original service-role
ALL grant despite 0079's UPDATE/DELETE revokes, but this is not a demonstrated
PostgREST route. Review these intended trust boundaries before broadening the
patch. None is represented here as a proven cross-vendor exploit.

## Missing security and correctness tests

Add role-aware tests for every new SECURITY DEFINER RPC, including denied
PUBLIC/anon/authenticated calls and a positive service-role call. New-user
INSERT tests matter independently from existing-row UPDATE tests. Test both
INSERT and UPDATE on server-owned fields, and positive vendor writes for new
columns added after a column ACL was narrowed. Test nested private JSON data,
not only top-level fields. Add two real transactions racing paid QR versus
walkup, QR across a limiter-window boundary, and the last daily cups. Exercise
repeated feedback, malformed options, actual completion with missing merqo,
and all storage read/write roles. Existing 131-assertion pgTAP coverage is
valuable but largely sequential and intentionally does not prove these races.

## DRY, SRP, YAGNI and deletion candidates

Do not delete historical migrations, including 0076/0077 and 0025/0026/0027:
full migration replay needs the creation and later removal in order. Repeated
CREATE OR REPLACE bodies are necessary migration snapshots, not automatically
dead files. The new private options validator prevents QR/walkup validation
drift. A future shared pricing SQL helper could reduce further duplication,
but extracting all pricing in this patch would expand its behavioral surface.

`qkit.next_order_number` and its types.ts RPC declaration have no application
callers; the function is fully superseded and retains its old >9999 truncation
bug. It is a candidate for removal in a new migration, alongside corresponding
absence tests, not by deleting 0008 or older revoke migrations. The stub-only
`supabase/snippets/README.md` is optional documentation, not runtime bloat.
The four demo scripts intentionally serve local/hosted and single/multiple
booth workflows; their duplicated menu JSON is a maintenance candidate, not
proof that a script is unused. Keep CI bootstrap and coffee seed used by e2e.
The seed/readme reference to print_enabled forcing preparing predates
payment-first 0087 and should be refreshed. README migration/test counts are
stale. types.ts remains a hand-written application schema subset, including
an absent print_status enum entry and no rate_limits table interface; no
current failing caller was identified from those omissions alone.

## Validation and uncertainty

Attempted:
`Get-Content supabase/tests/review-hardening.test.sql -Raw | docker exec -i supabase_db_qkit psql -U postgres -d postgres -v ON_ERROR_STOP=1`.
The Docker Linux engine pipe does not exist on this host. No local psql or
Supabase CLI is on PATH. Consequently the new pgTAP tests have not run and
neither failing-before nor passing-after DB execution is claimed. No hosted
DB was touched. Main review must run local migrations and all pgTAP tests
once a DB runtime is available, plus the two-session concurrency scenarios.
The new review SQL now has 46 named assertions. The first focused Vitest
attempt could not spawn esbuild under the sandbox; the escalated attempt was
interrupted. The root review is responsible for subsequent test execution and
recording its results; this report does not claim those runs occurred.

Fresh-eyes cross-agent review identified two realtime resync races in the
initial vendor patch: an UPDATE for an unseen order was discarded and then
caused its snapshot row to be skipped, and offset pagination could skip an
unchanged order when an earlier active row left the result set. Both were
reported to the implementing agent and root for regression fixes. The revised
keyset pagination and INSERT/UPDATE upsert were read again and address both
findings. A possible preexisting delayed-old-event overwrite was also passed
to that agent for timestamp-guard consideration. The pickup
action change was checked: it retains the ready-state compare-and-set and
now changes only collection state/timestamp, never payment confirmation.

PostgreSQL's own documentation confirms default PUBLIC function execution and
selective REVOKE requirements:
[CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html).
Its snapshot documentation distinguishes STABLE caller snapshots from VOLATILE
per-query snapshots:
[Function volatility](https://www.postgresql.org/docs/14/xfunc-volatility.html).
These support the ACL and concurrency analysis; live deployed ACLs remain
unverified.

## Reviewed file inventory

Migration files below define ordered schema history; the final effective body
or grant is determined by later replacements, not each file in isolation.

- `supabase/migrations/0000_create_qkit_schema.sql` — create qkit schema.
- `supabase/migrations/0001_initial_schema.sql` — initial schema.
- `supabase/migrations/0002_booth_images_and_storage.sql` — booth images and storage.
- `supabase/migrations/0003_plans_and_booth_limit.sql` — plans and booth limit.
- `supabase/migrations/0004_admin_role.sql` — admin role.
- `supabase/migrations/0005_events.sql` — events.
- `supabase/migrations/0006_admin_identity_and_audit.sql` — admin identity and audit.
- `supabase/migrations/0007_booth_hours.sql` — booth hours.
- `supabase/migrations/0008_atomic_order_numbers.sql` — atomic order numbers.
- `supabase/migrations/0009_booth_delete_cascade.sql` — booth delete cascade.
- `supabase/migrations/0010_monetization.sql` — monetization.
- `supabase/migrations/0011_pricing_intro.sql` — pricing intro.
- `supabase/migrations/0012_license_amount.sql` — license amount.
- `supabase/migrations/0013_indexes.sql` — indexes.
- `supabase/migrations/0014_payments_ledger.sql` — payments ledger.
- `supabase/migrations/0015_license_window.sql` — license window.
- `supabase/migrations/0016_booth_serveability.sql` — booth serveability.
- `supabase/migrations/0017_rate_limit.sql` — rate limit.
- `supabase/migrations/0018_feedback.sql` — feedback.
- `supabase/migrations/0019_feedback_nps_and_vendor_read.sql` — feedback nps and vendor read.
- `supabase/migrations/0020_license_label.sql` — license label.
- `supabase/migrations/0021_purchase_requests.sql` — purchase requests.
- `supabase/migrations/0022_order_timestamps.sql` — order timestamps.
- `supabase/migrations/0023_vendor_tour_seen.sql` — vendor tour seen.
- `supabase/migrations/0024_booth_payments.sql` — booth payments.
- `supabase/migrations/0025_booth_access_token.sql` — booth access token.
- `supabase/migrations/0026_regenerate_booth_token.sql` — regenerate booth token.
- `supabase/migrations/0027_booth_short_code.sql` — booth short code.
- `supabase/migrations/0028_stock_counter.sql` — stock counter.
- `supabase/migrations/0029_get_booth_for_order.sql` — get booth for order.
- `supabase/migrations/0030_place_order.sql` — place order.
- `supabase/migrations/0031_regenerate_short_code.sql` — regenerate short code.
- `supabase/migrations/0032_order_integrity.sql` — order integrity.
- `supabase/migrations/0033_authenticated_lockdown.sql` — authenticated lockdown.
- `supabase/migrations/0034_stock_race.sql` — stock race.
- `supabase/migrations/0035_update_policy_with_check.sql` — update policy with check.
- `supabase/migrations/0036_rate_limit_cleanup.sql` — rate limit cleanup.
- `supabase/migrations/0037_booth_images_bucket_limits.sql` — booth images bucket limits.
- `supabase/migrations/0038_entitlement_and_hardening.sql` — entitlement and hardening.
- `supabase/migrations/0039_rls_select_auth_uid.sql` — rls select auth uid.
- `supabase/migrations/0040_order_status_default.sql` — order status default.
- `supabase/migrations/0041_data_api_grants.sql` — data api grants.
- `supabase/migrations/0042_grant_and_enum_fixes.sql` — grant and enum fixes.
- `supabase/migrations/0043_anon_events_insert.sql` — anon events insert.
- `supabase/migrations/0044_order_token_and_hours.sql` — order token and hours.
- `supabase/migrations/0045_freeze_access_token.sql` — freeze access token.
- `supabase/migrations/0046_booth_open_overnight.sql` — booth open overnight.
- `supabase/migrations/0047_support_messages.sql` — support messages.
- `supabase/migrations/0048_feedback_order_proof.sql` — feedback order proof.
- `supabase/migrations/0049_feedback_booth_index.sql` — feedback booth index.
- `supabase/migrations/0050_vendor_board_settings.sql` — vendor board settings.
- `supabase/migrations/0051_emit_order_completed.sql` — emit order completed.
- `supabase/migrations/0052_vendor_social_links.sql` — vendor social links.
- `supabase/migrations/0053_booth_for_order_social_links.sql` — booth for order social links.
- `supabase/migrations/0054_vendor_profile_backfill.sql` — vendor profile backfill.
- `supabase/migrations/0055_place_order_free_price.sql` — place order free price.
- `supabase/migrations/0056_place_order_option_deltas.sql` — place order option deltas.
- `supabase/migrations/0057_order_priority_bump.sql` — order priority bump.
- `supabase/migrations/0058_platform_settings.sql` — platform settings.
- `supabase/migrations/0059_board_settings_undo_seconds.sql` — board settings undo seconds.
- `supabase/migrations/0060_walkup_orders.sql` — walkup orders.
- `supabase/migrations/0061_walkup_order_paid_flag.sql` — walkup order paid flag.
- `supabase/migrations/0062_board_settings_display_options.sql` — board settings display options.
- `supabase/migrations/0063_order_number_no_truncate.sql` — order number no truncate.
- `supabase/migrations/0064_booth_arrival_confirmation.sql` — booth arrival confirmation.
- `supabase/migrations/0065_ready_auto_clear.sql` — ready auto clear.
- `supabase/migrations/0066_menu_categories.sql` — menu categories.
- `supabase/migrations/0067_daily_order_number_reset_default_on.sql` — daily order number reset default on.
- `supabase/migrations/0068_show_wait_estimate.sql` — show wait estimate.
- `supabase/migrations/0069_drop_vendor_identity_columns.sql` — drop vendor identity columns.
- `supabase/migrations/0070_get_booth_for_order_vendor_profile_social_links.sql` — get booth for order vendor profile social links.
- `supabase/migrations/0071_vendor_feedback_convergence.sql` — vendor feedback convergence.
- `supabase/migrations/0072_support_messages_convergence.sql` — support messages convergence.
- `supabase/migrations/0073_drop_stale_local_feedback_support.sql` — drop stale local feedback support.
- `supabase/migrations/0074_qkit_wedge_pricing.sql` — qkit wedge pricing.
- `supabase/migrations/0075_place_order_customer_phone.sql` — place order customer phone.
- `supabase/migrations/0076_vendor_telegram.sql` — vendor telegram.
- `supabase/migrations/0077_drop_vendor_telegram.sql` — drop vendor telegram.
- `supabase/migrations/0078_order_status_events.sql` — order status events.
- `supabase/migrations/0079_audit_immutability_guard.sql` — audit immutability guard.
- `supabase/migrations/0080_booth_walkup_default.sql` — booth walkup default.
- `supabase/migrations/0081_orders_print_status.sql` — orders print status.
- `supabase/migrations/0082_booth_print_enabled.sql` — booth print enabled.
- `supabase/migrations/0083_booth_paykit_booking_id.sql` — booth paykit booking id.
- `supabase/migrations/0084_legal_check_state.sql` — legal check state.
- `supabase/migrations/0085_place_order_free_skips_payment.sql` — place order free skips payment.
- `supabase/migrations/0086_place_order_requires_accept_without_printer.sql` — place order requires accept without printer.
- `supabase/migrations/0087_payment_first_and_pickup.sql` — payment first and pickup.
- `supabase/migrations/0088_restrict_order_number_writes.sql` — restrict order number writes.
- `supabase/migrations/0089_revoke_walkup_order_public_execute.sql` — revoke walkup order public execute.
- `supabase/migrations/0090_booth_printkit_location_id.sql` — booth printkit location id.
- `supabase/migrations/0091_restrict_printkit_location_id_writes.sql` — restrict printkit location id writes.
- `supabase/migrations/0092_vendor_tours_seen.sql` — vendor tours seen.
- `supabase/migrations/0093_payment_proofs_bucket_limits.sql` — payment proofs bucket limits.
- `supabase/migrations/0094_booth_daily_cup_cap.sql` — booth daily cup cap.
- `supabase/migrations/0095_review_authorization_hardening.sql` — review authorization hardening.

Configuration and guides:

- `supabase/config.toml` — exposed schemas, explicit-grant mode, auth/storage/local DB configuration.
- `supabase/README.md` — database workflow and directory overview.
- `supabase/migrations/README.md` — ordered migration purpose and integration history.
- `supabase/tests/README.md` — pgTAP contract, fixtures and scope.
- `supabase/seed/README.md` — seed ownership, environments and consumers.
- `supabase/snippets/README.md` — empty saved-query directory guide.

Seeds:

- `supabase/seed/ci-auth-bootstrap.sql` — fixed local/CI auth and vendor fixture.
- `supabase/seed/coffee-cart.sql` — deterministic single-booth e2e menu and QR code.
- `supabase/seed/coffee-cart-prod.sql` — hosted single-booth demo seed; ownership issue above.
- `supabase/seed/demo-two-booths.sql` — destructive local demo replacement for one test vendor.
- `supabase/seed/demo-two-booths-prod.sql` — hosted demo reset; explicitly deletes that vendor's booths/orders.

Tests and schema contract:

- `supabase/tests/rls.test.sql` — existing 131 planned RLS/RPC/storage assertions.
- `supabase/tests/review-hardening.test.sql` — new role-aware October regressions.
- `src/lib/types.ts` — hand-written data, RPC and domain type contracts; private options-validator signature added.

Targeted application cross-checks: `src/app/onboarding/actions.ts`,
`src/app/dashboard/booths/actions.ts`, `src/app/admin/actions.ts`,
`src/app/api/merqo/vendor-provision/route.ts`, `src/lib/rate-limit.ts`,
`src/lib/rate-limit.test.ts`, `src/app/actions/events.ts`,
`src/app/actions/events.test.ts`, `src/app/actions/README.md`.
