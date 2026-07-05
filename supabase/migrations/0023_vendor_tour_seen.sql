-- Remember whether a vendor has seen the dashboard onboarding tour, so it
-- auto-runs only on first login (the floating "?" replay button ignores this).
-- Stored server-side (not localStorage) so it's user-scoped and consistent
-- across devices/browsers. Null = never seen. RLS already lets a vendor update
-- its own row, so no policy change is needed.
ALTER TABLE qkit.vendors
  ADD COLUMN IF NOT EXISTS tour_seen_at TIMESTAMPTZ;
