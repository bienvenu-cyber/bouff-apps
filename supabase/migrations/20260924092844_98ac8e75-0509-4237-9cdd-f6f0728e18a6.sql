CREATE OR REPLACE FUNCTION public.set_order_location(p_order text, p_phone text, p_lat double precision, p_lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.orders;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Position invalide.';
  END IF;
  SELECT * INTO v FROM public.orders WHERE upper(order_number) = upper(btrim(p_order));
  IF v.id IS NULL OR private.order_participant(v, p_phone) IS DISTINCT FROM 'customer' THEN
    RAISE EXCEPTION 'Accès refusé à cette commande.';
  END IF;
  IF v.order_type <> 'delivery' OR v.status IN ('delivered','cancelled') THEN
    RAISE EXCEPTION 'Position non modifiable pour cette commande.';
  END IF;
  UPDATE public.orders SET delivery_lat = p_lat, delivery_lng = p_lng WHERE id = v.id;
END $$;

CREATE OR REPLACE FUNCTION public.order_route(p_order text, p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.orders; r public.restaurants;
BEGIN
  SELECT * INTO v FROM public.orders WHERE upper(order_number) = upper(btrim(p_order));
  IF v.id IS NULL OR private.order_participant(v, p_phone) IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.restaurants WHERE id = v.restaurant_id;
  RETURN jsonb_build_object(
    'origin', CASE WHEN r.latitude IS NOT NULL THEN jsonb_build_object('lat', r.latitude, 'lng', r.longitude) END,
    'destination', CASE WHEN v.delivery_lat IS NOT NULL THEN jsonb_build_object('lat', v.delivery_lat, 'lng', v.delivery_lng) END);
END $$;