-- =========================================================
-- BOUFF — workflow de commande (logique serveur en base)
-- =========================================================

-- ---------------------------------------------------------
-- 1) Passer commande
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_order(
  p_restaurant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_order_type public.order_type,
  p_items jsonb,
  p_delivery_zone_id uuid DEFAULT NULL,
  p_delivery_address text DEFAULT NULL,
  p_payment_method public.payment_method DEFAULT 'cash',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    -- options choisies
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

    -- contrôle min/max par groupe d'options
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

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'items_total_fcfa', v_items_total,
    'delivery_fee_fcfa', v_delivery_fee,
    'total_fcfa', v_items_total + v_delivery_fee,
    'status', 'received'
  );
END;
$$;

-- ---------------------------------------------------------
-- 2) Suivi d'une commande sans compte
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_order(p_order_number text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'order_type', o.order_type,
    'total_fcfa', o.total_fcfa,
    'delivery_fee_fcfa', o.delivery_fee_fcfa,
    'created_at', o.created_at,
    'accepted_at', o.accepted_at,
    'ready_at', o.ready_at,
    'picked_up_at', o.picked_up_at,
    'delivered_at', o.delivered_at,
    'cancelled_at', o.cancelled_at,
    'cancel_reason', o.cancel_reason,
    'restaurant', r.name,
    'rider_name', rd.full_name,
    'rider_phone', rd.phone,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'item_name', i.item_name,
        'variant_name', i.variant_name,
        'quantity', i.quantity,
        'line_total_fcfa', i.line_total_fcfa,
        'options', COALESCE((SELECT jsonb_agg(oo.name) FROM public.order_item_options oo WHERE oo.order_item_id = i.id), '[]'::jsonb)
      ) ORDER BY i.created_at)
      FROM public.order_items i WHERE i.order_id = o.id
    ), '[]'::jsonb)
  )
  INTO v
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  LEFT JOIN public.riders rd ON rd.id = o.rider_id
  WHERE upper(o.order_number) = upper(btrim(p_order_number))
    AND regexp_replace(o.customer_phone, '\D', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');

  IF v IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.';
  END IF;
  RETURN v;
END;
$$;

-- ---------------------------------------------------------
-- 3) Cuisine : avancement des statuts
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_cancel_reason text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.';
  END IF;
  IF NOT private.manages_restaurant(auth.uid(), v_order.restaurant_id) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;

  IF p_status = 'cancelled' THEN
    IF v_order.status IN ('delivered','cancelled') THEN
      RAISE EXCEPTION 'Commande déjà terminée.';
    END IF;
    UPDATE public.orders
       SET status = 'cancelled', cancelled_at = now(),
           cancel_reason = NULLIF(btrim(COALESCE(p_cancel_reason,'')), '')
     WHERE id = p_order_id RETURNING * INTO v_order;
    IF v_order.rider_id IS NOT NULL THEN
      UPDATE public.riders SET status = 'available' WHERE id = v_order.rider_id;
    END IF;
    RETURN v_order;
  END IF;

  IF NOT (
    (v_order.status = 'received'   AND p_status = 'in_kitchen') OR
    (v_order.status = 'in_kitchen' AND p_status = 'ready') OR
    (v_order.status = 'ready'      AND p_status = 'delivered' AND v_order.order_type = 'takeaway')
  ) THEN
    RAISE EXCEPTION 'Changement de statut impossible (% → %).', v_order.status, p_status;
  END IF;

  UPDATE public.orders
     SET status = p_status,
         accepted_at  = CASE WHEN p_status = 'in_kitchen' THEN now() ELSE accepted_at END,
         ready_at     = CASE WHEN p_status = 'ready' THEN now() ELSE ready_at END,
         delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END
   WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- ---------------------------------------------------------
-- 4) Ruptures de stock
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_item_availability(p_menu_item_id uuid, p_available boolean)
RETURNS public.menu_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item public.menu_items;
BEGIN
  SELECT * INTO v_item FROM public.menu_items WHERE id = p_menu_item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Article introuvable.'; END IF;
  IF NOT private.manages_restaurant(auth.uid(), v_item.restaurant_id) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  UPDATE public.menu_items SET is_available = p_available WHERE id = p_menu_item_id RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_variant_availability(p_variant_id uuid, p_available boolean)
RETURNS public.item_variants
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_variant public.item_variants; v_rest uuid;
BEGIN
  SELECT * INTO v_variant FROM public.item_variants WHERE id = p_variant_id;
  IF v_variant.id IS NULL THEN RAISE EXCEPTION 'Formule introuvable.'; END IF;
  SELECT m.restaurant_id INTO v_rest FROM public.menu_items m WHERE m.id = v_variant.menu_item_id;
  IF NOT private.manages_restaurant(auth.uid(), v_rest) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  UPDATE public.item_variants SET is_available = p_available WHERE id = p_variant_id RETURNING * INTO v_variant;
  RETURN v_variant;
END;
$$;

-- ---------------------------------------------------------
-- 5) Livreurs
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_rider_status(p_status public.rider_status)
RETURNS public.riders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rider public.riders;
BEGIN
  SELECT * INTO v_rider FROM public.riders WHERE user_id = auth.uid();
  IF v_rider.id IS NULL THEN RAISE EXCEPTION 'Aucun livreur associé à ce compte.'; END IF;
  IF p_status = 'offline' AND EXISTS (
    SELECT 1 FROM public.orders WHERE rider_id = v_rider.id AND status = 'on_the_way'
  ) THEN
    RAISE EXCEPTION 'Course en cours : impossible de se déconnecter.';
  END IF;
  UPDATE public.riders SET status = p_status WHERE id = v_rider.id RETURNING * INTO v_rider;
  RETURN v_rider;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_order(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rider public.riders; v_order public.orders;
BEGIN
  SELECT * INTO v_rider FROM public.riders WHERE user_id = auth.uid() AND is_active;
  IF v_rider.id IS NULL THEN RAISE EXCEPTION 'Aucun livreur actif associé à ce compte.'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable.'; END IF;
  IF v_order.restaurant_id <> v_rider.restaurant_id THEN
    RAISE EXCEPTION 'Cette course ne concerne pas votre restaurant.';
  END IF;
  IF v_order.order_type <> 'delivery' THEN
    RAISE EXCEPTION 'Cette commande est à emporter.';
  END IF;
  IF v_order.status NOT IN ('in_kitchen','ready') THEN
    RAISE EXCEPTION 'Cette course n''est pas disponible.';
  END IF;
  IF v_order.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Course déjà prise par un autre livreur.';
  END IF;

  UPDATE public.orders SET rider_id = v_rider.id WHERE id = p_order_id RETURNING * INTO v_order;
  UPDATE public.riders SET status = 'on_delivery' WHERE id = v_rider.id;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.rider_advance_order(p_order_id uuid, p_status public.order_status)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rider public.riders; v_order public.orders;
BEGIN
  SELECT * INTO v_rider FROM public.riders WHERE user_id = auth.uid();
  IF v_rider.id IS NULL THEN RAISE EXCEPTION 'Aucun livreur associé à ce compte.'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.rider_id <> v_rider.id THEN
    RAISE EXCEPTION 'Cette course ne vous est pas affectée.';
  END IF;

  IF p_status = 'on_the_way' THEN
    IF v_order.status <> 'ready' THEN
      RAISE EXCEPTION 'La commande n''est pas encore prête.';
    END IF;
    UPDATE public.orders SET status = 'on_the_way', picked_up_at = now()
      WHERE id = p_order_id RETURNING * INTO v_order;
  ELSIF p_status = 'delivered' THEN
    IF v_order.status <> 'on_the_way' THEN
      RAISE EXCEPTION 'La commande n''est pas en route.';
    END IF;
    UPDATE public.orders SET status = 'delivered', delivered_at = now()
      WHERE id = p_order_id RETURNING * INTO v_order;
    UPDATE public.riders SET status = 'available' WHERE id = v_rider.id;
  ELSE
    RAISE EXCEPTION 'Statut non autorisé pour un livreur.';
  END IF;

  RETURN v_order;
END;
$$;

-- ---------------------------------------------------------
-- 6) Statistiques
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurant_stats(
  p_restaurant_id uuid,
  p_from date DEFAULT (now() AT TIME ZONE 'Africa/Porto-Novo')::date - 29,
  p_to date DEFAULT (now() AT TIME ZONE 'Africa/Porto-Novo')::date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    SELECT jsonb_agg(d ORDER BY d->>'day')
    FROM (
      SELECT jsonb_build_object(
        'day', (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date,
        'orders', count(*),
        'revenue_fcfa', COALESCE(sum(o.total_fcfa) FILTER (WHERE o.status = 'delivered'), 0)
      ) AS d
      FROM public.orders o
      WHERE o.restaurant_id = p_restaurant_id
        AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN p_from AND p_to
      GROUP BY 1
    ) s
  ), '[]'::jsonb));

  v := v || jsonb_build_object('top_items', COALESCE((
    SELECT jsonb_agg(t ORDER BY (t->>'quantity')::int DESC)
    FROM (
      SELECT jsonb_build_object(
        'item_name', i.item_name,
        'quantity', sum(i.quantity),
        'revenue_fcfa', sum(i.line_total_fcfa)
      ) AS t
      FROM public.order_items i
      JOIN public.orders o ON o.id = i.order_id
      WHERE o.restaurant_id = p_restaurant_id
        AND o.status <> 'cancelled'
        AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN p_from AND p_to
      GROUP BY i.item_name
      LIMIT 20
    ) s
  ), '[]'::jsonb));

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_stats(
  p_from date DEFAULT (now() AT TIME ZONE 'Africa/Porto-Novo')::date - 29,
  p_to date DEFAULT (now() AT TIME ZONE 'Africa/Porto-Novo')::date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT private.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;

  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'restaurants_active', (SELECT count(*) FROM public.restaurants WHERE is_active),
    'riders_active', (SELECT count(*) FROM public.riders WHERE is_active),
    'orders_count', COALESCE(count(*) FILTER (WHERE o.status <> 'cancelled'), 0),
    'revenue_fcfa', COALESCE(sum(o.total_fcfa) FILTER (WHERE o.status = 'delivered'), 0),
    'commission_fcfa', COALESCE(sum(o.commission_fcfa) FILTER (WHERE o.status = 'delivered'), 0)
  )
  INTO v
  FROM public.orders o
  WHERE (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN p_from AND p_to;

  v := v || jsonb_build_object('by_restaurant', COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'revenue_fcfa')::int DESC)
    FROM (
      SELECT jsonb_build_object(
        'restaurant_id', r.id,
        'restaurant', r.name,
        'orders', count(o.id) FILTER (WHERE o.status <> 'cancelled'),
        'revenue_fcfa', COALESCE(sum(o.total_fcfa) FILTER (WHERE o.status = 'delivered'), 0),
        'commission_fcfa', COALESCE(sum(o.commission_fcfa) FILTER (WHERE o.status = 'delivered'), 0)
      ) AS x
      FROM public.restaurants r
      LEFT JOIN public.orders o
        ON o.restaurant_id = r.id
       AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN p_from AND p_to
      GROUP BY r.id, r.name
    ) s
  ), '[]'::jsonb));

  RETURN v;
END;
$$;

-- ---------------------------------------------------------
-- 7) Droits d'exécution
-- ---------------------------------------------------------
REVOKE ALL ON FUNCTION public.place_order(uuid, text, text, public.order_type, jsonb, uuid, text, public.payment_method, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_order(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.place_order(uuid, text, text, public.order_type, jsonb, uuid, text, public.payment_method, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.track_order(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_order_status(uuid, public.order_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_item_availability(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_variant_availability(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_rider_status(public.rider_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rider_advance_order(uuid, public.order_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_stats(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_stats(date, date) TO authenticated, service_role;