-- Bind customer feedback to a real order.
--
-- submit_feedback let any caller post a 1-5★ rating (and message) against ANY
-- booth_id with any order_number — order_number was only length-checked, and
-- nothing proved the reviewer had ever ordered. The sole throttle was an
-- app-layer per-IP limit, which trusts a spoofable X-Forwarded-For and fails
-- open, so a competitor could review-bomb a booth's public rating at scale by
-- rotating the header.
--
-- Fix: add p_access_token and, for source='customer', require that
-- (booth_id, order_number, access_token) matches a real order — the same
-- unguessable per-order token the status page already requires to be viewed.
-- Vendor feedback is unchanged: it's stamped from auth.uid(), never a param.
--
-- The signature changes (new trailing param), so drop the old overload first
-- rather than leaving two.

DROP FUNCTION IF EXISTS qkit.submit_feedback(text, uuid, text, int, int, text);

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

  -- Mirror the table CHECKs + feedbackSchema so the direct-RPC path is bounded.
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
  -- Require at least a score or a message (feedbackSchema.refine).
  IF p_rating IS NULL AND p_nps IS NULL AND v_message IS NULL THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: empty';
  END IF;

  IF p_source = 'vendor' THEN
    -- vendor_id comes from the caller's own JWT (auth.uid() is the subject even
    -- inside SECURITY DEFINER) — never trusted from a param.
    v_vendor := auth.uid();
  ELSE
    -- Customer: prove the reviewer actually holds this order's access token.
    -- booth_id + the small sequential order_number are guessable; the per-order
    -- token minted by place_order is not, so it's what authorizes the review.
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
  END IF;

  INSERT INTO qkit.feedback
    (source, vendor_id, booth_id, order_number, rating, nps, message)
  VALUES
    (p_source, v_vendor, p_booth_id, NULLIF(p_order_number, ''),
     p_rating, p_nps, v_message);
END;
$$;

REVOKE ALL ON FUNCTION qkit.submit_feedback(text, uuid, text, int, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.submit_feedback(text, uuid, text, int, int, text, uuid) TO anon, authenticated;
