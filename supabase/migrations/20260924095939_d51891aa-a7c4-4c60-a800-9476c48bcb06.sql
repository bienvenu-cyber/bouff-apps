
CREATE TABLE public.favorites (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, menu_item_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites_own_select" ON public.favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "favorites_own_insert" ON public.favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_own_delete" ON public.favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX favorites_user_created_idx ON public.favorites (user_id, created_at DESC);

CREATE TYPE public.coupon_kind AS ENUM ('percent', 'fixed');
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  kind public.coupon_kind NOT NULL DEFAULT 'percent',
  value integer NOT NULL CHECK (value > 0),
  max_discount_fcfa integer CHECK (max_discount_fcfa IS NULL OR max_discount_fcfa > 0),
  min_order_fcfa integer NOT NULL DEFAULT 0 CHECK (min_order_fcfa >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  max_uses_per_customer integer NOT NULL DEFAULT 1 CHECK (max_uses_per_customer > 0),
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_percent_chk CHECK (kind <> 'percent' OR value <= 100)
);
CREATE UNIQUE INDEX coupons_code_scope_idx ON public.coupons (upper(code), COALESCE(restaurant_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_platform_admin" ON public.coupons FOR ALL TO authenticated
  USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));
CREATE TRIGGER coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders
  ADD COLUMN coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN coupon_code text,
  ADD COLUMN discount_fcfa integer NOT NULL DEFAULT 0 CHECK (discount_fcfa >= 0);
CREATE INDEX orders_coupon_idx ON public.orders (coupon_id) WHERE coupon_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.coupon_quote(p_restaurant uuid, p_code text, p_subtotal integer, p_phone text DEFAULT NULL, p_exclude_order uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.coupons; v_used int; v_mine int; v_disc int; v_phone text;
BEGIN
  SELECT * INTO c FROM public.coupons
   WHERE upper(code) = upper(btrim(COALESCE(p_code,'')))
     AND (restaurant_id = p_restaurant OR restaurant_id IS NULL)
   ORDER BY restaurant_id NULLS LAST LIMIT 1;
  IF c.id IS NULL OR NOT c.is_active THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Code promo invalide.');
  END IF;
  IF c.starts_at IS NOT NULL AND now() < c.starts_at THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Ce code promo n''est pas encore actif.');
  END IF;
  IF c.ends_at IS NOT NULL AND now() > c.ends_at THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Ce code promo a expiré.');
  END IF;
  IF COALESCE(p_subtotal,0) < c.min_order_fcfa THEN
    RETURN jsonb_build_object('valid', false, 'message', format('Ce code demande une commande d''au moins %s F.', c.min_order_fcfa));
  END IF;
  SELECT count(*) INTO v_used FROM public.orders
   WHERE coupon_id = c.id AND status <> 'cancelled' AND id IS DISTINCT FROM p_exclude_order;
  IF c.max_uses IS NOT NULL AND v_used >= c.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Ce code promo a atteint sa limite d''utilisation.');
  END IF;
  v_phone := regexp_replace(COALESCE(p_phone,''), '\D', '', 'g');
  SELECT count(*) INTO v_mine FROM public.orders
   WHERE coupon_id = c.id AND status <> 'cancelled' AND id IS DISTINCT FROM p_exclude_order
     AND ((auth.uid() IS NOT NULL AND customer_id = auth.uid())
          OR (v_phone <> '' AND regexp_replace(customer_phone, '\D', '', 'g') = v_phone));
  IF v_mine >= c.max_uses_per_customer THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Vous avez déjà utilisé ce code promo.');
  END IF;
  v_disc := CASE WHEN c.kind = 'percent' THEN floor(COALESCE(p_subtotal,0) * c.value / 100.0)::int ELSE c.value END;
  IF c.max_discount_fcfa IS NOT NULL THEN v_disc := LEAST(v_disc, c.max_discount_fcfa); END IF;
  v_disc := LEAST(v_disc, COALESCE(p_subtotal,0));
  RETURN jsonb_build_object('valid', true, 'coupon_id', c.id, 'code', upper(c.code), 'title', c.title,
    'kind', c.kind, 'value', c.value, 'discount_fcfa', v_disc, 'message', 'Code promo appliqué.');
END $$;
REVOKE ALL ON FUNCTION public.coupon_quote(uuid,text,integer,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_coupon(p_restaurant uuid, p_code text, p_subtotal integer, p_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.coupon_quote(p_restaurant, p_code, p_subtotal, p_phone, NULL) - 'coupon_id';
$$;
GRANT EXECUTE ON FUNCTION public.check_coupon(uuid,text,integer,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_coupons(p_restaurant uuid)
RETURNS TABLE (code text, title text, kind public.coupon_kind, value integer, min_order_fcfa integer, max_discount_fcfa integer, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT upper(c.code), c.title, c.kind, c.value, c.min_order_fcfa, c.max_discount_fcfa, c.ends_at
    FROM public.coupons c
   WHERE c.is_active AND c.is_public
     AND (c.restaurant_id = p_restaurant OR c.restaurant_id IS NULL)
     AND (c.starts_at IS NULL OR c.starts_at <= now())
     AND (c.ends_at IS NULL OR c.ends_at > now())
   ORDER BY c.created_at DESC LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.public_coupons(uuid) TO anon, authenticated;

DROP FUNCTION public.place_order(uuid,text,text,order_type,jsonb,uuid,text,payment_method,text);

CREATE OR REPLACE FUNCTION public.place_order(p_restaurant_id uuid, p_customer_name text, p_customer_phone text, p_order_type order_type, p_items jsonb, p_delivery_zone_id uuid DEFAULT NULL::uuid, p_delivery_address text DEFAULT NULL::text, p_payment_method payment_method DEFAULT 'cash'::payment_method, p_note text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rest public.restaurants;
  v_zone public.delivery_zones;
  v_item jsonb;
  v_menu public.menu_items;
  v_variant public.item_variants;
  v_order_id uuid;
  v_order_number text;
  v_unit integer;
  v_qty integer;
  v_items_total integer := 0;
  v_delivery_fee integer := 0;
  v_order_item_id uuid;
  v_opt public.options;
  v_opt_id uuid;
  v_grp public.option_groups;
  v_selected uuid[];
  v_count integer;
  v_today smallint;
  v_coupon jsonb;
  v_discount integer := 0;
  v_coupon_id uuid;
BEGIN
  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RAISE EXCEPTION 'Le nom du client est obligatoire.';
  END IF;
  IF p_customer_phone IS NULL OR length(regexp_replace(p_customer_phone, '\D', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide.';
  END IF;

  SELECT * INTO v_rest FROM public.restaurants WHERE id = p_restaurant_id;
  IF v_rest.id IS NULL OR NOT v_rest.is_active THEN
    RAISE EXCEPTION 'Restaurant indisponible.';
  END IF;

  IF p_order_type = 'delivery' AND NOT v_rest.accepts_delivery THEN
    RAISE EXCEPTION 'Ce restaurant ne fait pas de livraison.';
  END IF;
  IF p_order_type = 'takeaway' AND NOT v_rest.accepts_takeaway THEN
    RAISE EXCEPTION 'Ce restaurant ne fait pas de vente à emporter.';
  END IF;

  IF p_order_type = 'delivery' THEN
    IF p_delivery_address IS NULL OR btrim(p_delivery_address) = '' THEN
      RAISE EXCEPTION 'Adresse de livraison obligatoire.';
    END IF;
    SELECT * INTO v_zone FROM public.delivery_zones
      WHERE id = p_delivery_zone_id AND restaurant_id = p_restaurant_id AND is_active;
    IF v_zone.id IS NULL THEN
      RAISE EXCEPTION 'Zone de livraison invalide.';
    END IF;
    v_delivery_fee := v_zone.fee_fcfa;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Le panier est vide.';
  END IF;

  v_today := EXTRACT(DOW FROM (now() AT TIME ZONE 'Africa/Porto-Novo'))::smallint;

  INSERT INTO public.orders (
    restaurant_id, customer_id, customer_name, customer_phone, order_type,
    delivery_zone_id, delivery_address, delivery_fee_fcfa, payment_method, note,
    items_total_fcfa, total_fcfa, commission_fcfa
  ) VALUES (
    p_restaurant_id, auth.uid(), btrim(p_customer_name), btrim(p_customer_phone), p_order_type,
    CASE WHEN p_order_type = 'delivery' THEN p_delivery_zone_id ELSE NULL END,
    CASE WHEN p_order_type = 'delivery' THEN btrim(p_delivery_address) ELSE NULL END,
    v_delivery_fee, p_payment_method, NULLIF(btrim(COALESCE(p_note, '')), ''),
    0, 0, 0
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::integer, 1);
    IF v_qty < 1 OR v_qty > 50 THEN
      RAISE EXCEPTION 'Quantité invalide.';
    END IF;

    SELECT * INTO v_menu FROM public.menu_items
      WHERE id = (v_item->>'menu_item_id')::uuid AND restaurant_id = p_restaurant_id;
    IF v_menu.id IS NULL THEN
      RAISE EXCEPTION 'Article inconnu.';
    END IF;
    IF NOT v_menu.is_available THEN
      RAISE EXCEPTION 'Article indisponible : %', v_menu.name;
    END IF;
    IF v_menu.available_weekday IS NOT NULL AND v_menu.available_weekday <> v_today THEN
      RAISE EXCEPTION 'Article non disponible aujourd''hui : %', v_menu.name;
    END IF;

    v_variant := NULL;
    IF (v_item->>'variant_id') IS NOT NULL THEN
      SELECT * INTO v_variant FROM public.item_variants
        WHERE id = (v_item->>'variant_id')::uuid AND menu_item_id = v_menu.id;
      IF v_variant.id IS NULL THEN
        RAISE EXCEPTION 'Formule inconnue pour %', v_menu.name;
      END IF;
      IF NOT v_variant.is_available THEN
        RAISE EXCEPTION 'Formule indisponible : % - %', v_menu.name, v_variant.name;
      END IF;
      v_unit := v_variant.price_fcfa;
    ELSE
      IF EXISTS (SELECT 1 FROM public.item_variants WHERE menu_item_id = v_menu.id) THEN
        RAISE EXCEPTION 'Formule obligatoire pour %', v_menu.name;
      END IF;
      v_unit := v_menu.base_price_fcfa;
    END IF;

    SELECT COALESCE(array_agg((e)::uuid), '{}')
      INTO v_selected
      FROM jsonb_array_elements_text(COALESCE(v_item->'option_ids', '[]'::jsonb)) AS e;

    INSERT INTO public.order_items (
      order_id, menu_item_id, variant_id, item_name, variant_name,
      unit_price_fcfa, quantity, line_total_fcfa, note
    ) VALUES (
      v_order_id, v_menu.id, v_variant.id, v_menu.name, v_variant.name,
      0, v_qty, 0, NULLIF(btrim(COALESCE(v_item->>'note', '')), '')
    ) RETURNING id INTO v_order_item_id;

    FOREACH v_opt_id IN ARRAY v_selected
    LOOP
      SELECT o.* INTO v_opt
        FROM public.options o
        JOIN public.option_groups g ON g.id = o.group_id
       WHERE o.id = v_opt_id
         AND g.menu_item_id = v_menu.id
         AND (g.applies_to_kind IS NULL OR v_variant.id IS NULL OR g.applies_to_kind = v_variant.kind);
      IF v_opt.id IS NULL THEN
        RAISE EXCEPTION 'Option invalide pour %', v_menu.name;
      END IF;
      IF NOT v_opt.is_available THEN
        RAISE EXCEPTION 'Option indisponible : %', v_opt.name;
      END IF;

      v_unit := v_unit + v_opt.price_delta_fcfa;

      INSERT INTO public.order_item_options (order_item_id, option_id, name, price_delta_fcfa)
      VALUES (v_order_item_id, v_opt.id, v_opt.name, v_opt.price_delta_fcfa);
    END LOOP;

    FOR v_grp IN
      SELECT * FROM public.option_groups g
       WHERE g.menu_item_id = v_menu.id
         AND (g.applies_to_kind IS NULL OR v_variant.id IS NULL OR g.applies_to_kind = v_variant.kind)
    LOOP
      SELECT count(*) INTO v_count
        FROM public.order_item_options oio
        JOIN public.options o ON o.id = oio.option_id
       WHERE oio.order_item_id = v_order_item_id AND o.group_id = v_grp.id;
      IF v_count < v_grp.min_select THEN
        RAISE EXCEPTION 'Choix obligatoire manquant : % (%)', v_grp.name, v_menu.name;
      END IF;
      IF v_count > v_grp.max_select THEN
        RAISE EXCEPTION 'Trop de choix pour : % (%)', v_grp.name, v_menu.name;
      END IF;
    END LOOP;

    IF v_unit < 0 THEN
      v_unit := 0;
    END IF;

    UPDATE public.order_items
       SET unit_price_fcfa = v_unit,
           line_total_fcfa = v_unit * v_qty
     WHERE id = v_order_item_id;

    v_items_total := v_items_total + (v_unit * v_qty);
  END LOOP;

  UPDATE public.orders
     SET items_total_fcfa = v_items_total,
         total_fcfa = v_items_total + v_delivery_fee,
         commission_fcfa = round(v_items_total * v_rest.commission_rate / 100.0)
   WHERE id = v_order_id;

  IF NULLIF(btrim(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    PERFORM 1 FROM public.coupons c
      WHERE upper(c.code) = upper(btrim(p_coupon_code))
        AND (c.restaurant_id IS NULL OR c.restaurant_id = p_restaurant_id)
      FOR UPDATE;
    v_coupon := public.coupon_quote(p_restaurant_id, p_coupon_code, v_items_total, p_customer_phone, v_order_id);
    IF NOT (v_coupon->>'valid')::boolean THEN
      RAISE EXCEPTION '%', v_coupon->>'message';
    END IF;
    v_discount := (v_coupon->>'discount_fcfa')::integer;
    v_coupon_id := (v_coupon->>'coupon_id')::uuid;
    UPDATE public.orders
       SET coupon_id = v_coupon_id,
           coupon_code = v_coupon->>'code',
           discount_fcfa = v_discount,
           total_fcfa = GREATEST(v_items_total - v_discount, 0) + v_delivery_fee,
           commission_fcfa = round(GREATEST(v_items_total - v_discount, 0) * v_rest.commission_rate / 100.0)
     WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'items_total_fcfa', v_items_total,
    'delivery_fee_fcfa', v_delivery_fee,
    'discount_fcfa', v_discount,
    'coupon_code', v_coupon->>'code',
    'total_fcfa', GREATEST(v_items_total - v_discount, 0) + v_delivery_fee,
    'status', 'received'
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public.place_order(uuid,text,text,order_type,jsonb,uuid,text,payment_method,text,text) TO anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  platform text,
  order_updates boolean NOT NULL DEFAULT true,
  offers boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON public.push_tokens (user_id);
GRANT SELECT, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_tokens_own_select" ON public.push_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "push_tokens_own_delete" ON public.push_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER push_tokens_updated_at BEFORE UPDATE ON public.push_tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.push_tokens;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  IF p_token IS NULL OR p_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$' THEN
    RAISE EXCEPTION 'Jeton de notification invalide.';
  END IF;
  INSERT INTO public.push_tokens (token, user_id, platform) VALUES (p_token, auth.uid(), left(p_platform, 20))
  ON CONFLICT (token) DO UPDATE SET user_id = auth.uid(), platform = COALESCE(EXCLUDED.platform, push_tokens.platform), updated_at = now()
  RETURNING * INTO r;
  DELETE FROM public.push_tokens WHERE user_id = auth.uid() AND token IN (
    SELECT token FROM public.push_tokens WHERE user_id = auth.uid() ORDER BY updated_at DESC OFFSET 10);
  RETURN jsonb_build_object('token', r.token, 'order_updates', r.order_updates, 'offers', r.offers);
END $$;
GRANT EXECUTE ON FUNCTION public.register_push_token(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_push_preferences(p_order_updates boolean, p_offers boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  UPDATE public.push_tokens SET order_updates = p_order_updates, offers = p_offers WHERE user_id = auth.uid();
  RETURN jsonb_build_object('order_updates', p_order_updates, 'offers', p_offers);
END $$;
GRANT EXECUTE ON FUNCTION public.set_push_preferences(boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.push_tokens WHERE token = p_token AND user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.unregister_push_token(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_push_for_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_msgs jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'to', t.token, 'title', NEW.title, 'body', COALESCE(NEW.body, ''), 'sound', 'default',
    'priority', 'high', 'channelId', 'default',
    'data', jsonb_build_object('type', 'order', 'orderId', NEW.order_id, 'notificationId', NEW.id)))
    INTO v_msgs
    FROM public.push_tokens t
   WHERE t.user_id = NEW.user_id AND t.order_updates;
  IF v_msgs IS NULL THEN RETURN NEW; END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_msgs,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push non envoyé: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER notifications_send_push AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.send_push_for_notification();
