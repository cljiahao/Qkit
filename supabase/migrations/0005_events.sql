-- ── Analytics events ─────────────────────────────────────────────────────────

CREATE TABLE public.events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID        REFERENCES public.vendors(id) ON DELETE SET NULL,
  type        TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX events_type_created_idx ON public.events (type, created_at);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Anyone may log an event (like order inserts); no public read.
CREATE POLICY "events_public_insert" ON public.events
  FOR INSERT WITH CHECK (true);

-- Only admins may read events. Relies on public.is_admin() from 0004.
CREATE POLICY "events_admin_select" ON public.events
  FOR SELECT USING (public.is_admin(auth.uid()));
