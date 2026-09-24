ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_coords_chk CHECK (
    (delivery_lat IS NULL AND delivery_lng IS NULL) OR
    (delivery_lat BETWEEN -90 AND 90 AND delivery_lng BETWEEN -180 AND 180));

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_coords_chk CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180));

CREATE OR REPLACE FUNCTION public.set_order_location(p_order text, p_phone text, p_lat double precision, p_lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.orders;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Position invalide.';
  END IF;
  SELECT * INTO v FROM public.orders WHERE upper(order_number) = upper(btrim(p_order));
  IF v.id IS NULL OR public.order_participant(p_order, p_phone) IS DISTINCT FROM 'customer' THEN
    RAISE EXCEPTION 'Accès refusé à cette commande.';
  END IF;
  IF v.order_type <> 'delivery' OR v.status IN ('delivered','cancelled') THEN
    RAISE EXCEPTION 'Position non modifiable pour cette commande.';
  END IF;
  UPDATE public.orders SET delivery_lat = p_lat, delivery_lng = p_lng WHERE id = v.id;
END $$;
REVOKE ALL ON FUNCTION public.set_order_location(text,text,double precision,double precision) FROM public;
GRANT EXECUTE ON FUNCTION public.set_order_location(text,text,double precision,double precision) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.order_route(p_order text, p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF public.order_participant(p_order, p_phone) IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'origin', CASE WHEN r.latitude IS NOT NULL THEN jsonb_build_object('lat', r.latitude, 'lng', r.longitude) END,
    'destination', CASE WHEN o.delivery_lat IS NOT NULL THEN jsonb_build_object('lat', o.delivery_lat, 'lng', o.delivery_lng) END)
  INTO v FROM public.orders o JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE upper(o.order_number) = upper(btrim(p_order));
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.order_route(text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.order_route(text,text) TO anon, authenticated;