-- RLS rejects ordinary over-cap inserts; the statement trigger also catches
-- multirow and concurrent inserts whose policy snapshots both saw zero booths.
CREATE FUNCTION qkit.enforce_booth_creation_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_vendors uuid[];
  v_vendor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT pg_catalog.array_agg(vendor_id ORDER BY vendor_id) INTO v_vendors
      FROM (SELECT DISTINCT vendor_id FROM changed_booths) affected;
  ELSE
    -- Reassignment increases the destination's count. Editing or deactivating
    -- existing booths after a paid plan expires must remain possible.
    SELECT pg_catalog.array_agg(vendor_id ORDER BY vendor_id) INTO v_vendors
      FROM (
        SELECT n.vendor_id
        FROM changed_booths n
        GROUP BY n.vendor_id
        HAVING count(*) > (
          SELECT count(*) FROM previous_booths o WHERE o.vendor_id = n.vendor_id
        )
      ) affected;
  END IF;

  FOREACH v_vendor IN ARRAY coalesce(v_vendors, ARRAY[]::uuid[]) LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('qkit.booths.creation_cap'), pg_catalog.hashtext(v_vendor::text));
    IF NOT coalesce(qkit.vendor_entitled(v_vendor), false) THEN
      IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'free booth creation requires READ COMMITTED isolation'
          USING ERRCODE = '22023';
      END IF;
      IF (SELECT count(*) FROM qkit.booths WHERE vendor_id = v_vendor) > 1 THEN
        RAISE EXCEPTION 'free booth creation limit exceeded'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER booths_enforce_creation_cap
  AFTER INSERT ON qkit.booths
  REFERENCING NEW TABLE AS changed_booths
  FOR EACH STATEMENT EXECUTE FUNCTION qkit.enforce_booth_creation_cap();

CREATE TRIGGER booths_enforce_reassignment_cap
  AFTER UPDATE ON qkit.booths
  REFERENCING OLD TABLE AS previous_booths NEW TABLE AS changed_booths
  FOR EACH STATEMENT EXECUTE FUNCTION qkit.enforce_booth_creation_cap();

REVOKE ALL ON FUNCTION qkit.enforce_booth_creation_cap()
  FROM PUBLIC, anon, authenticated, service_role;
