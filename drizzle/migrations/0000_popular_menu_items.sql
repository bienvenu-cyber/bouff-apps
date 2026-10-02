-- BOUFF : plats les plus commandés (30 derniers jours), sans aucune donnée client.
CREATE OR REPLACE FUNCTION public.popular_menu_items(_limit int DEFAULT 10)
RETURNS TABLE(menu_item_id uuid, total_qty bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oi.menu_item_id, SUM(oi.quantity)::bigint AS total_qty
  FROM public.order_items oi
  WHERE oi.menu_item_id IS NOT NULL
    AND oi.created_at > now() - interval '30 days'
  GROUP BY oi.menu_item_id
  ORDER BY total_qty DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 20)
$$;
REVOKE ALL ON FUNCTION public.popular_menu_items(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.popular_menu_items(int) TO anon, authenticated, service_role;