-- printkit_location_id (0090) is server-assigned only; authenticated's
-- table-level UPDATE let a vendor set it directly. Same fix shape as
-- 0088's orders.order_number lockdown.
REVOKE UPDATE ON qkit.booths FROM authenticated;
GRANT UPDATE (
  id, vendor_id, name, menu_items, is_active, created_at, image_url, hours,
  order_seq, payment, short_code, social_links, requires_arrival_confirm,
  menu_categories, walkup_default, print_enabled, paykit_booking_id
) ON qkit.booths TO authenticated;
