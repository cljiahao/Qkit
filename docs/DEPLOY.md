# qkit — Deploy Notes

qkit runs on the **shared Merqo Supabase project** (same one as loopkit/merqo),
in its own `qkit` schema.

## Notes

- **qkit-loopkit auto-award**: apply merqo's `0008_kit_events.sql` first,
  then this repo's `0051_emit_order_completed.sql`. Set
  `NEXT_PUBLIC_LOOPKIT_URL` in Vercel env before deploying the order-status
  page change, or the earn link silently never shows (fails closed).
