-- ── Separate admin identity ──────────────────────────────────────────────────

-- Admin membership lives here now, not as a flag on vendors. Admins have no
-- vendor row and cannot run booths.
CREATE TABLE public.admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Carry over anyone already flagged admin, then drop the flag.
INSERT INTO public.admins (user_id)
  SELECT id FROM public.vendors WHERE is_admin = true
  ON CONFLICT DO NOTHING;

-- Redefine is_admin() to read the new table. Every RLS policy that calls it
-- (vendors/booths/orders/events select) keeps working unchanged.
CREATE OR REPLACE FUNCTION public.is_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_uid);
$$;

ALTER TABLE public.vendors DROP COLUMN is_admin;

-- ── Admin audit log ──────────────────────────────────────────────────────────

CREATE TABLE public.admin_audit (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  target_id  UUID,
  detail     JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX admin_audit_created_idx ON public.admin_audit (created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

-- Admins may read both. No insert/update/delete policies: membership and audit
-- rows are written only through the service-role client (Server Actions / SQL),
-- which bypasses RLS.
CREATE POLICY "admins_admin_select" ON public.admins
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "admin_audit_admin_select" ON public.admin_audit
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Grant yourself admin after applying:
--   insert into public.admins (user_id) values ('<your-user-id>');
