-- Position GPS des livreurs
CREATE TABLE public.rider_locations (
  rider_id uuid PRIMARY KEY REFERENCES public.riders(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy double precision,
  heading double precision,
  speed double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rider_locations TO authenticated;
GRANT ALL ON public.rider_locations TO service_role;
ALTER TABLE public.rider_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY rider_locations_select ON public.rider_locations FOR SELECT TO authenticated
USING (
  rider_id = private.current_rider_id()
  OR EXISTS (SELECT 1 FROM public.riders r WHERE r.id = rider_id AND private.manages_restaurant(auth.uid(), r.restaurant_id))
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.rider_id = rider_locations.rider_id AND o.customer_id = auth.uid() AND o.status IN ('ready','on_the_way'))
);

CREATE OR REPLACE FUNCTION public.update_rider_location(
  p_latitude double precision, p_longitude double precision,
  p_accuracy double precision DEFAULT NULL, p_heading double precision DEFAULT NULL, p_speed double precision DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rider uuid;
BEGIN
  SELECT id INTO v_rider FROM public.riders WHERE user_id = auth.uid() AND is_active;
  IF v_rider IS NULL THEN RAISE EXCEPTION 'Aucun livreur actif associé à ce compte.'; END IF;
  INSERT INTO public.rider_locations(rider_id, latitude, longitude, accuracy, heading, speed, recorded_at)
  VALUES (v_rider, p_latitude, p_longitude, p_accuracy, p_heading, p_speed, now())
  ON CONFLICT (rider_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
    accuracy = EXCLUDED.accuracy, heading = EXCLUDED.heading, speed = EXCLUDED.speed, recorded_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.update_rider_location(double precision,double precision,double precision,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_rider_location(double precision,double precision,double precision,double precision,double precision) TO authenticated;

-- Accès d'un participant à une commande (client connecté, client invité par téléphone, livreur affecté, gérant)
CREATE OR REPLACE FUNCTION private.order_participant(p_order public.orders, p_phone text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_order.rider_id IS NOT NULL AND p_order.rider_id = private.current_rider_id() THEN 'rider'
    WHEN auth.uid() IS NOT NULL AND p_order.customer_id = auth.uid() THEN 'customer'
    WHEN p_phone IS NOT NULL AND length(trim(p_phone)) >= 8
      AND regexp_replace(p_order.customer_phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g') THEN 'customer'
    WHEN auth.uid() IS NOT NULL AND private.manages_restaurant(auth.uid(), p_order.restaurant_id) THEN 'staff'
    ELSE NULL END
$$;

-- Position du livreur pour le suivi (pendant la course seulement)
CREATE OR REPLACE FUNCTION public.order_rider_location(p_order text, p_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders; v_loc public.rider_locations;
BEGIN
  SELECT * INTO v_order FROM public.orders
   WHERE (p_order ~* '^[0-9a-f-]{36}$' AND id = p_order::uuid) OR order_number = p_order LIMIT 1;
  IF v_order.id IS NULL OR private.order_participant(v_order, p_phone) IS NULL THEN RETURN NULL; END IF;
  IF v_order.rider_id IS NULL OR v_order.status NOT IN ('ready','on_the_way') THEN RETURN NULL; END IF;
  SELECT * INTO v_loc FROM public.rider_locations WHERE rider_id = v_order.rider_id;
  IF v_loc.rider_id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('latitude', v_loc.latitude, 'longitude', v_loc.longitude,
    'accuracy', v_loc.accuracy, 'heading', v_loc.heading, 'speed', v_loc.speed, 'recordedAt', v_loc.recorded_at);
END; $$;
GRANT EXECUTE ON FUNCTION public.order_rider_location(text, text) TO anon, authenticated;

-- Chat client <-> livreur
CREATE TABLE public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('customer','rider','staff')),
  sender_name text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_messages_order_idx ON public.order_messages(order_id, created_at);
GRANT SELECT ON public.order_messages TO authenticated;
GRANT ALL ON public.order_messages TO service_role;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_messages_select ON public.order_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (
  o.customer_id = auth.uid() OR o.rider_id = private.current_rider_id() OR private.manages_restaurant(auth.uid(), o.restaurant_id))));
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;

CREATE OR REPLACE FUNCTION public.list_order_messages(p_order text, p_phone text DEFAULT NULL)
RETURNS SETOF public.order_messages LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders
   WHERE (p_order ~* '^[0-9a-f-]{36}$' AND id = p_order::uuid) OR order_number = p_order LIMIT 1;
  IF v_order.id IS NULL OR private.order_participant(v_order, p_phone) IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.order_messages WHERE order_id = v_order.id ORDER BY created_at LIMIT 500;
END; $$;
GRANT EXECUTE ON FUNCTION public.list_order_messages(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_order_message(p_order text, p_body text, p_phone text DEFAULT NULL)
RETURNS public.order_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders; v_role text; v_name text; v_msg public.order_messages; v_recent int;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'Message vide.'; END IF;
  IF length(p_body) > 1000 THEN RAISE EXCEPTION 'Message trop long (1000 caractères maximum).'; END IF;
  SELECT * INTO v_order FROM public.orders
   WHERE (p_order ~* '^[0-9a-f-]{36}$' AND id = p_order::uuid) OR order_number = p_order LIMIT 1;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable.'; END IF;
  v_role := private.order_participant(v_order, p_phone);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Accès refusé à cette commande.'; END IF;
  IF v_order.rider_id IS NULL OR v_order.status NOT IN ('in_kitchen','ready','on_the_way') THEN
    RAISE EXCEPTION 'Le chat est ouvert seulement pendant la livraison.';
  END IF;
  SELECT count(*) INTO v_recent FROM public.order_messages
   WHERE order_id = v_order.id AND sender_role = v_role AND created_at > now() - interval '1 minute';
  IF v_recent >= 20 THEN RAISE EXCEPTION 'Trop de messages, patientez un instant.'; END IF;
  IF v_role = 'rider' THEN SELECT full_name INTO v_name FROM public.riders WHERE id = v_order.rider_id;
  ELSIF v_role = 'customer' THEN v_name := v_order.customer_name;
  ELSE v_name := 'Restaurant'; END IF;
  INSERT INTO public.order_messages(order_id, sender_role, sender_name, body)
  VALUES (v_order.id, v_role, coalesce(v_name, v_role), trim(p_body)) RETURNING * INTO v_msg;
  RETURN v_msg;
END; $$;
GRANT EXECUTE ON FUNCTION public.send_order_message(text, text, text) TO anon, authenticated;