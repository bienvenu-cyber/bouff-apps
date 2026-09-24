CREATE OR REPLACE FUNCTION public.restaurant_stats(p_restaurant_id uuid, p_from date DEFAULT (((now() AT TIME ZONE 'Africa/Porto-Novo'::text))::date - 29), p_to date DEFAULT ((now() AT TIME ZONE 'Africa/Porto-Novo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT private.manages_restaurant(auth.uid(), p_restaurant_id) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;

  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'orders_count', COALESCE(count(*) FILTER (WHERE o.status <> 'cancelled'), 0),
    'cancelled_count', COALESCE(count(*) FILTER (WHERE o.status = 'cancelled'), 0),
    'revenue_fcfa', COALESCE(sum(o.total_fcfa) FILTER (WHERE o.status = 'delivered'), 0),
    'commission_fcfa', COALESCE(sum(o.commission_fcfa) FILTER (WHERE o.status = 'delivered'), 0),
    'average_basket_fcfa', COALESCE(round(avg(o.total_fcfa) FILTER (WHERE o.status = 'delivered')), 0),
    'delivery_count', COALESCE(count(*) FILTER (WHERE o.order_type = 'delivery' AND o.status <> 'cancelled'), 0),
    'takeaway_count', COALESCE(count(*) FILTER (WHERE o.order_type = 'takeaway' AND o.status <> 'cancelled'), 0)
  )
  INTO v
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN p_from AND p_to;

  v := v || jsonb_build_object('daily', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('day', s.day, 'orders', s.orders, 'revenue_fcfa', s.revenue) ORDER BY s.day)
    FROM (
      SELECT (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date AS day,
             count(*) AS orders,
             COALESCE(sum(o.total_fcfa) FILTER (WHERE o.status = 'delivered'), 0) AS revenue
      FROM public.orders o
      WHERE o.restaurant_id = p_restaurant_id
        AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN p_from AND p_to
      GROUP BY (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date
    ) s
  ), '[]'::jsonb));

  v := v || jsonb_build_object('top_items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('item_name', s.item_name, 'quantity', s.qty, 'revenue_fcfa', s.rev) ORDER BY s.qty DESC)
    FROM (
      SELECT i.item_name, sum(i.quantity) AS qty, sum(i.line_total_fcfa) AS rev
      FROM public.order_items i
      JOIN public.orders o ON o.id = i.order_id
      WHERE o.restaurant_id = p_restaurant_id
        AND o.status <> 'cancelled'
        AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN p_from AND p_to
      GROUP BY i.item_name
      ORDER BY sum(i.quantity) DESC
      LIMIT 20
    ) s
  ), '[]'::jsonb));

  RETURN v;
END;
$function$;