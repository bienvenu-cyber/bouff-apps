DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.platform_stats(date,date)',
    'public.restaurant_stats(uuid,date,date)',
    'public.advance_order_status(uuid,order_status,text)',
    'public.claim_order(uuid)',
    'public.rider_advance_order(uuid,order_status)',
    'public.set_item_availability(uuid,boolean)',
    'public.set_rider_status(rider_status)',
    'public.set_variant_availability(uuid,boolean)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;