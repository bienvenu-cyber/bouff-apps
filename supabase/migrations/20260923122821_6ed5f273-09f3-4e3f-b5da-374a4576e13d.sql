CREATE OR REPLACE FUNCTION public.payment_order_lookup(p_token text, p_order_number text, p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v jsonb;
BEGIN
  IF NOT private.check_service_token('payments', p_token) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  SELECT jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'total_fcfa', o.total_fcfa,
    'status', o.status::text,
    'customer_phone', o.customer_phone,
    'payment_method', o.payment_method::text
  ) INTO v
  FROM public.orders o
  WHERE upper(o.order_number) = upper(btrim(p_order_number))
    AND regexp_replace(o.customer_phone, '\D', '', 'g') = regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  IF v IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.';
  END IF;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.payment_order_lookup(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_order_lookup(text, text, text) TO anon, authenticated, service_role;