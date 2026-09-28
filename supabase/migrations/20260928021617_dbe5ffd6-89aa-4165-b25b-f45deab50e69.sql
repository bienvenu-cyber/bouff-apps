CREATE OR REPLACE FUNCTION public.track_order(p_order_number text, p_phone text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'order_type', o.order_type,
    'total_fcfa', o.total_fcfa, 'delivery_fee_fcfa', o.delivery_fee_fcfa,
    'items_total_fcfa', o.items_total_fcfa, 'discount_fcfa', o.discount_fcfa, 'coupon_code', o.coupon_code,
    'created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at,
    'picked_up_at', o.picked_up_at, 'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at,
    'cancel_reason', o.cancel_reason, 'restaurant', r.name,
    'rider_name', rd.full_name, 'rider_phone', rd.phone,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'item_name', i.item_name, 'variant_name', i.variant_name, 'quantity', i.quantity,
        'line_total_fcfa', i.line_total_fcfa,
        'options', COALESCE((SELECT jsonb_agg(oo.name) FROM public.order_item_options oo WHERE oo.order_item_id = i.id), '[]'::jsonb)
      ) ORDER BY i.created_at)
      FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb)
  ) INTO v
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  LEFT JOIN public.riders rd ON rd.id = o.rider_id
  WHERE upper(o.order_number) = upper(btrim(p_order_number))
    AND regexp_replace(o.customer_phone, '\D', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF v IS NULL THEN RAISE EXCEPTION 'Commande introuvable.'; END IF;
  RETURN v;
END;
$function$;