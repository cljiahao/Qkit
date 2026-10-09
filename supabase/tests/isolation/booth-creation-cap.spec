# Disposable database only; apply migrations first. Expect second_insert to
# block until first_commit, then return false and leave exactly one booth.
setup
{
  INSERT INTO auth.users(id,instance_id,aud,role,email) VALUES
    ('0097ffff-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booth-isolation@test.local');
  INSERT INTO qkit.vendors(id) VALUES ('0097ffff-0000-0000-0000-000000000001');
  CREATE FUNCTION public.audit_booth_creation_attempt(p_name text) RETURNS boolean
    LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO qkit.booths(vendor_id,name) VALUES
        ('0097ffff-0000-0000-0000-000000000001',p_name);
      RETURN true;
    EXCEPTION WHEN insufficient_privilege THEN
      RETURN false;
    END $$;
}
teardown
{
  DROP FUNCTION public.audit_booth_creation_attempt(text);
  DELETE FROM auth.users WHERE id='0097ffff-0000-0000-0000-000000000001';
}
session first
step first_begin
{
  BEGIN ISOLATION LEVEL READ COMMITTED;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims',json_build_object('sub','0097ffff-0000-0000-0000-000000000001','role','authenticated')::text,true);
}
step first_insert { SELECT public.audit_booth_creation_attempt('first') AS first_succeeded; }
step first_commit { COMMIT; }
session second
step second_begin
{
  BEGIN ISOLATION LEVEL READ COMMITTED;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims',json_build_object('sub','0097ffff-0000-0000-0000-000000000001','role','authenticated')::text,true);
}
step second_insert { SELECT public.audit_booth_creation_attempt('second') AS second_succeeded; }
step second_commit { COMMIT; }
session verifier
step verify
{
  SELECT count(*)=1 AND min(name)='first' AS exactly_one_booth
  FROM qkit.booths WHERE vendor_id='0097ffff-0000-0000-0000-000000000001';
}
permutation first_begin first_insert second_begin second_insert first_commit second_commit verify
