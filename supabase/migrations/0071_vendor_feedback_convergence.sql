-- Converge qkit's vendor-sourced feedback (source='vendor') into the shared
-- merqo.vendor_feedback table (merqo migration 0011) — the same 0-10 NPS
-- concept loopkit/stockkit/paykit already converged. Customer-sourced rows
-- (1-5 star ordering-experience ratings) are untouched, stay local. See
-- docs/superpowers/specs/2026-07-23-qkit-vendor-feedback-convergence-design.md

CREATE OR REPLACE FUNCTION qkit.submit_feedback(
  p_source       text,
  p_booth_id     uuid    DEFAULT NULL,
  p_order_number text    DEFAULT NULL,
  p_rating       int     DEFAULT NULL,
  p_nps          int     DEFAULT NULL,
  p_message      text    DEFAULT NULL,
  p_access_token uuid    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  v_vendor  uuid := NULL;
  v_message text;
BEGIN
  IF p_source NOT IN ('customer', 'vendor') THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: source';
  END IF;

  v_message := NULLIF(btrim(COALESCE(p_message, '')), '');
  IF v_message IS NOT NULL AND char_length(v_message) > 2000 THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: message too long';
  END IF;
  IF p_order_number IS NOT NULL AND char_length(p_order_number) > 40 THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: order number';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: rating';
  END IF;
  IF p_nps IS NOT NULL AND (p_nps < 0 OR p_nps > 10) THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: nps';
  END IF;
  IF p_rating IS NULL AND p_nps IS NULL AND v_message IS NULL THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: empty';
  END IF;

  IF p_source = 'vendor' THEN
    v_vendor := auth.uid();

    IF EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_schema = 'merqo' AND routine_name = 'submit_vendor_feedback'
    ) THEN
      PERFORM merqo.submit_vendor_feedback('qkit', p_nps, v_message);
    END IF;

    RETURN;
  END IF;

  IF p_booth_id IS NULL
     OR p_order_number IS NULL
     OR p_access_token IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM qkit.orders
       WHERE booth_id = p_booth_id
         AND order_number = p_order_number
         AND access_token = p_access_token
     )
  THEN
    RAISE EXCEPTION 'FEEDBACK_UNAUTHORIZED: order proof required';
  END IF;

  INSERT INTO qkit.feedback
    (source, vendor_id, booth_id, order_number, rating, message)
  VALUES
    (p_source, NULL, p_booth_id, NULLIF(p_order_number, ''), p_rating, v_message);
END;
$$;

REVOKE ALL ON FUNCTION qkit.submit_feedback(text, uuid, text, int, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.submit_feedback(text, uuid, text, int, int, text, uuid) TO anon, authenticated;

-- One-time, guarded backfill of qkit's existing local vendor rows into the
-- shared table. Guarded the same way (no merqo schema in qkit's own
-- isolated CI Postgres). Idempotent via NOT EXISTS (no natural key survives
-- the copy) — same pattern the other three kits' backfills already use.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'merqo' AND table_name = 'vendor_feedback'
  ) THEN
    INSERT INTO merqo.vendor_feedback (kit_slug, vendor_id, nps, message, created_at)
    SELECT 'qkit', vendor_id, nps, message, created_at
    FROM qkit.feedback f
    WHERE f.source = 'vendor'
      AND f.vendor_id IS NOT NULL
      AND f.nps IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM merqo.vendor_feedback vf
        WHERE vf.kit_slug = 'qkit'
          AND vf.vendor_id = f.vendor_id
          AND vf.created_at = f.created_at
      );
  END IF;
END $$;
