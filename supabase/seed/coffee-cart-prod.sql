-- Kopitiam Cart demo seed for PRODUCTION (hosted Supabase).
--
-- Run in the Supabase SQL Editor. Replace __VENDOR_ID__ (both places) with the
-- auth user id of the vendor account that should own the demo cart — i.e. your
-- Google account's User UID (Authentication → Users → that user → copy UID).
-- vendors.id == auth.users.id.
--
-- Idempotent: safe to re-run; it upserts the vendor row and the booth.

-- 1. Ensure the vendor row exists (no-op if that account already onboarded).
insert into public.vendors (id, name)
values ('__VENDOR_ID__', 'Kopitiam Cart')
on conflict (id) do nothing;

-- 2. Seed the booth with the 3 customizable drinks.
with v as (select '__VENDOR_ID__'::uuid as vendor_id)
insert into public.booths (id, vendor_id, name, is_active, image_url, menu_items)
select
  'c0ffee01-0000-4000-8000-000000000001',
  v.vendor_id,
  'Kopitiam Cart',
  true,
  '/seed/kopitiam-cart.svg',
  '[
    {
      "id":"kopi","name":"Kopi","description":"Local coffee","price_cents":140,
      "image_url":"/seed/kopi.svg","available":true,
      "option_groups":[
        {"id":"style","label":"Style","choices":[
          {"id":"o","label":"O (black)"},
          {"id":"c","label":"C (evaporated milk)"},
          {"id":"normal","label":"Normal (condensed milk)"}
        ]},
        {"id":"temp","label":"Temperature","choices":[
          {"id":"hot","label":"Hot"},
          {"id":"iced","label":"Iced"}
        ]},
        {"id":"sugar","label":"Sugar","choices":[
          {"id":"normal","label":"Normal"},
          {"id":"less","label":"Less"},
          {"id":"none","label":"None"}
        ]}
      ]
    },
    {
      "id":"teh","name":"Teh","description":"Local tea","price_cents":140,
      "image_url":"/seed/teh.svg","available":true,
      "option_groups":[
        {"id":"style","label":"Style","choices":[
          {"id":"o","label":"O (no milk)"},
          {"id":"c","label":"C (evaporated milk)"},
          {"id":"normal","label":"Normal (condensed milk)"}
        ]},
        {"id":"temp","label":"Temperature","choices":[
          {"id":"hot","label":"Hot"},
          {"id":"iced","label":"Iced"}
        ]},
        {"id":"sugar","label":"Sugar","choices":[
          {"id":"normal","label":"Normal"},
          {"id":"less","label":"Less"},
          {"id":"none","label":"None"}
        ]}
      ]
    },
    {
      "id":"milo","name":"Milo","description":"Malt chocolate","price_cents":200,
      "image_url":"/seed/milo.svg","available":true,
      "option_groups":[
        {"id":"temp","label":"Temperature","choices":[
          {"id":"hot","label":"Hot"},
          {"id":"iced","label":"Iced"}
        ]},
        {"id":"sugar","label":"Sugar","choices":[
          {"id":"normal","label":"Normal"},
          {"id":"less","label":"Less"},
          {"id":"none","label":"None"}
        ]}
      ]
    }
  ]'::jsonb
from v
on conflict (id) do update
  set vendor_id  = excluded.vendor_id,
      name       = excluded.name,
      is_active  = excluded.is_active,
      image_url  = excluded.image_url,
      menu_items = excluded.menu_items;
