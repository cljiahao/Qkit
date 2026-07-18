-- Maintenance banner: a public-read singleton, same shape as qkit.pricing
-- (0010) — id pinned to 1, no UPDATE policy at all. Writes go through the
-- service-role admin action only (requireAdmin() gates it in app code);
-- RLS default-denies UPDATE for every client role since no policy grants it.
CREATE TABLE qkit.platform_settings (
  id              INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  banner_enabled  BOOLEAN     NOT NULL DEFAULT false,
  banner_message  TEXT        NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO qkit.platform_settings (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE qkit.platform_settings ENABLE ROW LEVEL SECURITY;

-- The banner must render for anonymous customers on public order pages too,
-- not just logged-in vendors — same "not secret, keep it simple" reasoning
-- as qkit.pricing's public read.
CREATE POLICY "platform_settings_public_select" ON qkit.platform_settings
  FOR SELECT USING (true);

GRANT SELECT ON qkit.platform_settings TO anon;
GRANT SELECT ON qkit.platform_settings TO authenticated;
