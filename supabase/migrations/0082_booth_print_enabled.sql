-- Per-booth opt-in for printkit label printing. Defaults to false — a
-- vendor must explicitly turn printing on for a booth; before this
-- column, every order on every booth unconditionally fired a print job
-- creation call to printkit regardless of whether the vendor had a
-- printkit account or a paired bridge. See
-- docs/superpowers/specs/2026-08-23-printkit-location-routing-design.md.

ALTER TABLE qkit.booths ADD COLUMN print_enabled BOOLEAN NOT NULL DEFAULT false;
