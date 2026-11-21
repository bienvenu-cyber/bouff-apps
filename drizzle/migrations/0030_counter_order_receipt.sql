CREATE OR REPLACE FUNCTION public.counter_order_receipt(p_token text, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.cashiers;
  o public.orders;
  r public.restaurants;
  seller text;
BEGIN
  c := private.counter_cashier(p_token);
  SELECT * INTO o FROM public.orders
   WHERE id = p_order_id AND restaurant_id = c.restaurant_id AND source = 'counter';
  IF o.id IS NULL THEN RAISE EXCEPTION 'Commande comptoir introuvable.'; END IF;
  SELECT * INTO r FROM public.restaurants WHERE id = o.restaurant_id;
  SELECT full_name INTO seller FROM public.cashiers WHERE id = o.cashier_id;
  RETURN jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'created_at', o.created_at,
    'paid_at', o.paid_at,
    'dine_in', o.dine_in,
    'payment_method', o.payment_method,
    'customer_name', o.customer_name,
    'items_total_fcfa', o.items_total_fcfa,
    'discount_fcfa', COALESCE(o.discount_fcfa, 0),
    'total_fcfa', o.total_fcfa,
    'cashier_name', seller,
    'restaurant', jsonb_build_object('name', r.name, 'address', r.address, 'phone', r.phone, 'city', r.city),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', i.item_name,
        'variant', i.variant_name,
        'quantity', i.quantity,
        'unit_price_fcfa', i.unit_price_fcfa,
        'line_total_fcfa', i.line_total_fcfa,
        'options', COALESCE((SELECT jsonb_agg(op.name ORDER BY op.created_at) FROM public.order_item_options op WHERE op.order_item_id = i.id), '[]'::jsonb)
      ) ORDER BY i.created_at)
      FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.counter_order_receipt(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_order_receipt(text, uuid) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.counter_order_receipt(text, uuid) IS 'Contenu du reçu imprimé à la caisse : session caisse valide, commandes comptoir du même restaurant uniquement, prix tels qu''enregistrés.';