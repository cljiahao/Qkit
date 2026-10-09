begin;
select no_plan();

select ok(not has_function_privilege('anon', 'qkit.patch_board_settings(jsonb)', 'EXECUTE'),
  'anonymous callers cannot patch vendor settings');
select ok(has_function_privilege('authenticated', 'qkit.patch_board_settings(jsonb)', 'EXECUTE'),
  'authenticated vendors can execute the patch RPC');
select ok(not (select prosecdef from pg_proc where oid = 'qkit.patch_board_settings(jsonb)'::regprocedure),
  'patch RPC retains the caller RLS permissions');

insert into auth.users (id, instance_id, aud, role, email) values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','settings-a@test.local'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','settings-b@test.local');
insert into qkit.vendors(id) values ('20000000-0000-0000-0000-000000000001'), ('20000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$ select qkit.patch_board_settings('{"sound_id":"bell"}') $$,
  'sound section can save one field');
select lives_ok($$ select qkit.patch_board_settings('{"desktop_notify":true}') $$,
  'a later notification patch merges with the saved sound');
select is((select board_settings->>'sound_id' from qkit.vendors), 'bell',
  'notification save preserves the independent sound preference');
select is((select board_settings->>'desktop_notify' from qkit.vendors), 'true',
  'notification preference is persisted');
select throws_ok($$ select qkit.patch_board_settings('{"plan":"pro"}') $$,'22023',null,
  'unknown privileged keys are rejected');
select throws_ok($$ select qkit.patch_board_settings('{"desktop_notify":"true"}') $$,'22023',null,
  'direct RPC callers must send actual booleans');
select throws_ok($$ select qkit.patch_board_settings('{"undo_seconds":2.5}') $$,'22023',null,
  'fractional timing values are rejected');
select throws_ok($$ select qkit.patch_board_settings('{"default_prep_minutes":61}') $$,'22023',null,
  'timing caps apply at the database boundary');
select throws_ok($$ select qkit.patch_board_settings('{"aging_min":240}') $$,'22023',null,
  'partial timing changes must remain valid against the locked current overdue value');
select throws_ok($$ select qkit.patch_board_settings('{"id":"20000000-0000-0000-0000-000000000002"}') $$,'22023',null,
  'the caller cannot target another vendor');
select is((select count(*) from qkit.vendors where id='20000000-0000-0000-0000-000000000002'),0::bigint,
  'another vendor stays invisible under RLS');
reset role;
select isnt((select board_settings->>'sound_id' from qkit.vendors where id='20000000-0000-0000-0000-000000000002'),'bell',
  'another vendor preferences are not changed');

select * from finish();
rollback;
