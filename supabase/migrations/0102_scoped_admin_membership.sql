-- RLS asks about the current subject; only server administration may inspect another user.
CREATE OR REPLACE FUNCTION qkit.is_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p_uid IS NOT NULL
    AND (
      p_uid IS NOT DISTINCT FROM (SELECT auth.uid())
      OR (SELECT auth.role()) IS NOT DISTINCT FROM 'service_role'
    )
    AND EXISTS (SELECT 1 FROM qkit.admins WHERE user_id = p_uid);
$$;

REVOKE ALL ON FUNCTION qkit.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION qkit.is_admin(uuid) TO authenticated, service_role;
