BEGIN;
SELECT no_plan();

SELECT ok(NOT has_function_privilege('anon', 'qkit.is_admin(uuid)', 'EXECUTE'),
  'anonymous callers cannot invoke the membership helper');
SELECT ok(has_function_privilege('authenticated', 'qkit.is_admin(uuid)', 'EXECUTE'),
  'authenticated RLS callers retain helper execution');
SELECT ok(has_function_privilege('service_role', 'qkit.is_admin(uuid)', 'EXECUTE'),
  'server administration retains helper execution');
SELECT ok(has_function_privilege(current_user, 'qkit.is_admin(uuid)', 'EXECUTE'),
  'migration owner retains function execution');

INSERT INTO auth.users(id, instance_id, aud, role, email) VALUES
  ('00980000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-scope-a@test.local'),
  ('00980000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-scope-b@test.local'),
  ('00980000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-scope-vendor@test.local');
INSERT INTO qkit.admins(user_id) VALUES
  ('00980000-0000-0000-0000-000000000001'),
  ('00980000-0000-0000-0000-000000000002');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok($$SELECT qkit.is_admin('00980000-0000-0000-0000-000000000001')$$,
  '42501', NULL, 'anonymous membership lookup is denied');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00980000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000001'), true,
  'an administrator can check their own membership');
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000002'), false,
  'an administrator cannot use this RPC to enumerate another administrator');
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000003'), false,
  'a foreign non-admin membership query returns no information');
SELECT is(qkit.is_admin(NULL), false, 'null subject is never an administrator');
SELECT ok((SELECT count(*) FROM qkit.admins) >= 2,
  'self-subject helper continues to authorize the existing administrator RLS policy');

SELECT set_config('request.jwt.claims', '{"sub":"00980000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000001'), false,
  'a non-admin cannot enumerate a known administrator');
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000003'), false,
  'a non-admin can check their own false membership');
SELECT is((SELECT count(*) FROM qkit.admins), 0::bigint,
  'non-admin callers still cannot read administrator rows');

SELECT set_config('request.jwt.claims', '{"sub":"00980000-0000-0000-0000-000000000003"}', true);
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000001'), false,
  'missing JWT role does not bypass a mismatched subject');
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000001'), false,
  'missing subject does not authorize a foreign membership query');
SELECT set_config('request.jwt.claims', '{}', true);
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000001'), false,
  'missing role and subject fail closed');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000001'), true,
  'trusted server can inspect the first administrator');
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000002'), true,
  'trusted server can inspect another administrator');
SELECT is(qkit.is_admin('00980000-0000-0000-0000-000000000003'), false,
  'trusted server lookup preserves false membership');
SELECT is(qkit.is_admin(NULL), false, 'trusted server still rejects null subject');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
