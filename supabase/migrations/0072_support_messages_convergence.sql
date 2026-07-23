-- One-time copy of qkit's existing local support_messages rows into the
-- shared merqo.support_messages table (merqo migration 0010). New
-- submissions go straight to merqo going forward (see
-- src/app/actions/support.ts) — this is a one-time historical copy. See
-- docs/superpowers/specs/2026-07-23-cross-kit-support-messages-remaining-kits-design.md

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'merqo' AND table_name = 'support_messages'
  ) THEN
    INSERT INTO merqo.support_messages (user_id, kit_slug, category, body, status, created_at)
    SELECT vendor_id, 'qkit', category, body, status, created_at
    FROM qkit.support_messages sm
    WHERE NOT EXISTS (
      SELECT 1 FROM merqo.support_messages msm
      WHERE msm.kit_slug = 'qkit'
        AND msm.user_id = sm.vendor_id
        AND msm.created_at = sm.created_at
    );
  END IF;
END $$;
