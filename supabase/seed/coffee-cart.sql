-- Kopitiam Cart: a second booth under the existing "Test" vendor.
-- vendors.id is FK to auth.users.id, so we reuse the real Test vendor instead
-- of fabricating an auth user. Run manually (see the plan); never via `db reset`.
insert into public.booths (id, vendor_id, name, is_active, image_url, menu_items)
values (
  'c0ffee01-0000-4000-8000-000000000001',
  '6df824a1-9da2-4608-ad13-2400a9114ec0',
  'Kopitiam Cart',
  true,
  '/seed/kopitiam-chart.svg',
  '[
    {"id":"k-kopi-o","name":"Kopi O","description":"Black coffee, sugar","price_cents":140,"image_url":"/seed/kopi-o.svg","available":true},
    {"id":"k-kopi","name":"Kopi","description":"Coffee with condensed milk","price_cents":160,"image_url":"/seed/kopi.svg","available":true},
    {"id":"k-kopi-c","name":"Kopi C","description":"Coffee, evaporated milk, sugar","price_cents":170,"image_url":"/seed/kopi-c.svg","available":true},
    {"id":"k-teh","name":"Teh","description":"Tea with condensed milk","price_cents":160,"image_url":"/seed/teh.svg","available":true},
    {"id":"k-teh-o","name":"Teh O","description":"Tea, sugar","price_cents":140,"image_url":"/seed/teh-o.svg","available":true},
    {"id":"k-teh-c","name":"Teh C","description":"Tea, evaporated milk, sugar","price_cents":170,"image_url":"/seed/teh-c.svg","available":true},
    {"id":"k-milo","name":"Milo","description":"Malt, condensed milk","price_cents":200,"image_url":"/seed/milo.svg","available":true}
  ]'::jsonb
)
on conflict (id) do update
  set name = excluded.name,
      is_active = excluded.is_active,
      image_url = excluded.image_url,
      menu_items = excluded.menu_items;
