-- Demo dataset: the "Test" vendor on the PRO plan with TWO active booths —
-- "Kopitiam Cart" (PayNow payment wired) and "Ice Cream Cart" (queue only, no
-- payment). Use this for the demo video and manual multi-booth testing.
--
-- Self-contained + idempotent: it ensures the vendor, resets that vendor's
-- booths (orders cascade-delete via migration 0009), then re-inserts both.
-- Run manually against LOCAL Supabase — never `db reset`, never prod.
--   docker exec -i supabase_db_qkit psql -U postgres -d postgres < supabase/seed/demo-two-booths.sql

-- ── Vendor (FK to auth.users) on the Pro plan (Pro lifts the 1-booth cap) ─────
insert into auth.users (id, instance_id, aud, role, email)
values ('6df824a1-9da2-4608-ad13-2400a9114ec0',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'test@qkit.local')
on conflict (id) do nothing;

insert into qkit.vendors (id, name, plan)
values ('6df824a1-9da2-4608-ad13-2400a9114ec0', 'Test', 'pro')
on conflict (id) do update set plan = 'pro';

-- ── Clean slate for this vendor (cascades orders) ────────────────────────────
delete from qkit.booths
where vendor_id = '6df824a1-9da2-4608-ad13-2400a9114ec0';

-- ── Booth 1: Kopitiam Cart — PayNow payment wired ────────────────────────────
insert into qkit.booths
  (id, vendor_id, name, is_active, image_url, payment, menu_items)
values (
  'c0ffee01-0000-4000-8000-000000000001',
  '6df824a1-9da2-4608-ad13-2400a9114ec0',
  'Kopitiam Cart',
  true,
  '/seed/kopitiam-cart.svg',
  '{"kind":"paynow","payee_name":"Kopitiam Cart","uen":"53312345A"}'::jsonb,
  '[
    {
      "id":"kopi","name":"Kopi","description":"Local coffee","price_cents":140,
      "image_url":"/seed/kopi.svg","available":true,
      "option_groups":[
        {"id":"style","label":"Style","choices":[
          {"id":"o","label":"O (black)"},
          {"id":"c","label":"C (evaporated milk)","allergens":["dairy"]},
          {"id":"normal","label":"Normal (condensed milk)","allergens":["dairy"]},
          {"id":"oat","label":"Oat Milk","price_delta_cents":100,"cost_delta_cents":40}
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
          {"id":"c","label":"C (evaporated milk)","allergens":["dairy"]},
          {"id":"normal","label":"Normal (condensed milk)","allergens":["dairy"]},
          {"id":"oat","label":"Oat Milk","price_delta_cents":100,"cost_delta_cents":40}
        ]},
        {"id":"temp","label":"Temperature","choices":[
          {"id":"hot","label":"Hot"},
          {"id":"iced","label":"Iced"}
        ]}
      ]
    },
    {
      "id":"milo","name":"Milo","description":"Malt chocolate","price_cents":200,
      "image_url":"/seed/milo.svg","available":true,"allergens":["dairy","soy"],
      "option_groups":[
        {"id":"temp","label":"Temperature","choices":[
          {"id":"hot","label":"Hot"},
          {"id":"iced","label":"Iced"}
        ]}
      ]
    }
  ]'::jsonb
);

-- ── Booth 2: Ice Cream Cart — queue only, NO payment ─────────────────────────
insert into qkit.booths
  (id, vendor_id, name, is_active, image_url, payment, menu_items)
values (
  '1ce01ce0-0000-4000-8000-000000000002',
  '6df824a1-9da2-4608-ad13-2400a9114ec0',
  'Ice Cream Cart',
  true,
  '/seed/ice-cream-cart.svg',
  null,
  '[
    {
      "id":"scoop","name":"Single Scoop","description":"One scoop in a cup or cone","price_cents":300,
      "available":true,
      "option_groups":[
        {"id":"flavour","label":"Flavour","choices":[
          {"id":"vanilla","label":"Vanilla"},
          {"id":"chocolate","label":"Chocolate"},
          {"id":"strawberry","label":"Strawberry"},
          {"id":"milo","label":"Milo","allergens":["dairy","soy"]}
        ]},
        {"id":"serving","label":"Serving","choices":[
          {"id":"cup","label":"Cup"},
          {"id":"cone","label":"Cone"}
        ]}
      ]
    },
    {
      "id":"double","name":"Double Scoop","description":"Two scoops, your pick","price_cents":500,
      "available":true,
      "option_groups":[
        {"id":"serving","label":"Serving","choices":[
          {"id":"cup","label":"Cup"},
          {"id":"cone","label":"Cone"}
        ]},
        {"id":"toppings","label":"Toppings","multiple":true,"choices":[
          {"id":"sprinkles","label":"Sprinkles"},
          {"id":"peanuts","label":"Peanuts","allergens":["nuts"]},
          {"id":"wafer","label":"Wafer","allergens":["gluten"]}
        ]}
      ]
    },
    {
      "id":"affogato","name":"Affogato","description":"Vanilla scoop drowned in espresso","price_cents":450,
      "available":true
    }
  ]'::jsonb
);
