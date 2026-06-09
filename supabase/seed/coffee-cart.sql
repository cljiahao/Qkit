-- Kopitiam Cart: 3 base drinks under the existing "Test" vendor, each with
-- single-choice option groups. vendors.id is FK to auth.users.id, so we reuse
-- the real Test vendor. Run manually (Step 2); never via `db reset`.
insert into public.booths (id, vendor_id, name, is_active, image_url, menu_items)
values (
  'c0ffee01-0000-4000-8000-000000000001',
  '6df824a1-9da2-4608-ad13-2400a9114ec0',
  'Kopitiam Cart',
  true,
  '/seed/kopitiam-chart.svg',
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
)
on conflict (id) do update
  set name = excluded.name,
      is_active = excluded.is_active,
      image_url = excluded.image_url,
      menu_items = excluded.menu_items;
