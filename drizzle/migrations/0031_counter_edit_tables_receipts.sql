-- Caisse : modification avant cuisine, numéro de table, reçus groupés, reçus côté gérante, montant reçu / monnaie rendue.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_label text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cash_received_fcfa integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.orders ADD CONSTRAINT orders_table_label_len CHECK (table_label IS NULL OR length(table_label) BETWEEN 1 AND 12);
ALTER TABLE public.orders ADD CONSTRAINT orders_cash_received_pos CHECK (cash_received_fcfa IS NULL OR cash_received_fcfa >= 0);
COMMENT ON COLUMN public.orders.table_label IS 'Numéro de table (sur place, caisse) : sert à servir, pas à payer plus tard.';
COMMENT ON COLUMN public.orders.cash_received_fcfa IS 'Espèces remises par le client à la caisse ; monnaie rendue = cash_received_fcfa - total_fcfa.';

CREATE TABLE public.order_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  cashier_id uuid REFERENCES public.cashiers(id) ON DELETE SET NULL,
  author_name text,
  old_total_fcfa integer NOT NULL,
  new_total_fcfa integer NOT NULL,
  extra_received_fcfa integer,
  old_items jsonb NOT NULL,
  new_items jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_edits_order_idx ON public.order_edits (order_id, created_at);
CREATE INDEX order_edits_restaurant_idx ON public.order_edits (restaurant_id, created_at);
GRANT SELECT ON public.order_edits TO authenticated;
GRANT ALL ON public.order_edits TO service_role;
ALTER TABLE public.order_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gérants : historique des modifications" ON public.order_edits FOR SELECT TO authenticated
  USING (private.has_restaurant_role(auth.uid(), 'restaurant_admin', restaurant_id));

-- Lignes d'une commande : une seule règle de prix pour l'appli, le site et la caisse.
CREATE OR REPLACE FUNCTION private.order_fill_items(p_order_id uuid, p_restaurant_id uuid, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_order_id uuid := p_order_id;
  v_item jsonb;
  v_menu public.menu_items;
  v_variant public.item_variants;
  v_unit integer;
  v_qty integer;
  v_items_total integer := 0;
  v_order_item_id uuid;
  v_opt public.options;
  v_opt_id uuid;
  v_grp public.option_groups;
  v_selected uuid[];
  v_count integer;
  v_today smallint;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Le panier est vide.';
  END IF;

  v_today := EXTRACT(DOW FROM (now() AT TIME ZONE 'Africa/Porto-Novo'))::smallint;

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
      v_unit := public.effective_variant_price(v_variant);
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

  RETURN v_items_total;
END $function$;
REVOKE ALL ON FUNCTION private.order_fill_items(uuid, uuid, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.place_order_base(p_restaurant_id uuid, p_customer_name text, p_customer_phone text, p_order_type order_type, p_items jsonb, p_delivery_zone_id uuid DEFAULT NULL::uuid, p_delivery_address text DEFAULT NULL::text, p_payment_method payment_method DEFAULT 'cash'::payment_method, p_note text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rest public.restaurants;
  v_zone public.delivery_zones;
  v_order_id uuid;
  v_order_number text;
  v_items_total integer := 0;
  v_delivery_fee integer := 0;
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

  v_items_total := private.order_fill_items(v_order_id, p_restaurant_id, p_items);

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

CREATE OR REPLACE FUNCTION private.counter_table(p_dine_in boolean, p_table text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE t text := NULLIF(btrim(COALESCE(p_table, '')), '');
BEGIN
  IF NOT COALESCE(p_dine_in, false) OR t IS NULL THEN RETURN NULL; END IF;
  IF length(t) > 12 THEN RAISE EXCEPTION 'Numéro de table trop long (12 caractères maximum).'; END IF;
  RETURN t;
END $function$;

CREATE OR REPLACE FUNCTION private.counter_note(p_dine_in boolean, p_table text, p_note text, p_edited boolean) RETURNS text
LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE WHEN COALESCE(p_dine_in, false) THEN 'SUR PLACE' ELSE 'À EMPORTER' END || ' · Comptoir'
      || COALESCE(' · Table ' || p_table, '')
      || COALESCE(' · ' || NULLIF(btrim(COALESCE(p_note, '')), ''), '')
      || CASE WHEN p_edited THEN ' · MODIFIÉE' ELSE '' END;
$function$;

CREATE OR REPLACE FUNCTION private.order_lines_json(p_order_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'menu_item_id', i.menu_item_id,
      'variant_id', i.variant_id,
      'option_ids', COALESCE((SELECT jsonb_agg(op.option_id ORDER BY op.created_at) FROM public.order_item_options op WHERE op.order_item_id = i.id AND op.option_id IS NOT NULL), '[]'::jsonb),
      'name', i.item_name,
      'variant', i.variant_name,
      'quantity', i.quantity,
      'unit_price_fcfa', i.unit_price_fcfa,
      'line_total_fcfa', i.line_total_fcfa,
      'options', COALESCE((SELECT jsonb_agg(op.name ORDER BY op.created_at) FROM public.order_item_options op WHERE op.order_item_id = i.id), '[]'::jsonb)
    ) ORDER BY i.created_at, i.id), '[]'::jsonb)
  FROM public.order_items i WHERE i.order_id = p_order_id;
$function$;
REVOKE ALL ON FUNCTION private.order_lines_json(uuid) FROM PUBLIC;

-- Contenu d'un reçu : toujours les prix et montants enregistrés.
CREATE OR REPLACE FUNCTION private.order_receipt_json(p_order_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT jsonb_build_object(
    'order_id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'source', o.source,
    'order_type', o.order_type,
    'created_at', o.created_at,
    'paid_at', o.paid_at,
    'delivered_at', o.delivered_at,
    'edited_at', o.edited_at,
    'dine_in', o.dine_in,
    'table_label', o.table_label,
    'payment_method', o.payment_method,
    'customer_name', o.customer_name,
    'delivery_address', CASE WHEN o.order_type = 'delivery' THEN o.delivery_address END,
    'items_total_fcfa', o.items_total_fcfa,
    'discount_fcfa', COALESCE(o.discount_fcfa, 0),
    'delivery_fee_fcfa', COALESCE(o.delivery_fee_fcfa, 0),
    'free_delivery_used', COALESCE(o.free_delivery_used, false),
    'wallet_used_fcfa', COALESCE(o.wallet_used_fcfa, 0),
    'tip_fcfa', COALESCE(o.tip_fcfa, 0),
    'total_fcfa', o.total_fcfa,
    'cash_received_fcfa', CASE WHEN o.payment_method = 'cash' THEN o.cash_received_fcfa END,
    'change_fcfa', CASE WHEN o.payment_method = 'cash' AND o.cash_received_fcfa IS NOT NULL THEN GREATEST(o.cash_received_fcfa - o.total_fcfa, 0) END,
    'cashier_name', (SELECT k.full_name FROM public.cashiers k WHERE k.id = o.cashier_id),
    'restaurant', jsonb_build_object('name', r.name, 'address', r.address, 'phone', r.phone, 'city', r.city),
    'items', private.order_lines_json(o.id)
  )
  FROM public.orders o JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.id = p_order_id;
$function$;
REVOKE ALL ON FUNCTION private.order_receipt_json(uuid) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.counter_place_order(text, jsonb, boolean, payment_method, text, text, text);
CREATE OR REPLACE FUNCTION public.counter_place_order(
  p_token text, p_items jsonb, p_dine_in boolean, p_payment_method payment_method,
  p_customer_name text DEFAULT NULL, p_customer_phone text DEFAULT NULL, p_note text DEFAULT NULL,
  p_table_label text DEFAULT NULL, p_cash_received integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE c public.cashiers; v jsonb; v_phone text; v_digits text; v_customer uuid; v_table text; v_total integer; v_received integer;
BEGIN
  c := private.counter_cashier(p_token);
  IF p_payment_method NOT IN ('cash','mobile_money') THEN RAISE EXCEPTION 'Paiement : espèces ou MoMo uniquement.'; END IF;
  v_digits := regexp_replace(COALESCE(p_customer_phone,''), '\D', '', 'g');
  IF v_digits <> '' AND length(v_digits) < 8 THEN RAISE EXCEPTION 'Numéro du client invalide.'; END IF;
  v_phone := CASE WHEN v_digits = '' THEN '00000000' ELSE btrim(p_customer_phone) END;
  v_table := private.counter_table(p_dine_in, p_table_label);

  PERFORM set_config('bouff.counter', '1', true);
  v := public.place_order_base(c.restaurant_id, COALESCE(NULLIF(btrim(COALESCE(p_customer_name,'')), ''), 'Client comptoir'),
         v_phone, 'takeaway', p_items, NULL, NULL, p_payment_method, private.counter_note(p_dine_in, v_table, p_note, false), NULL);
  PERFORM set_config('bouff.counter', '', true);

  v_total := (v->>'total_fcfa')::int;
  IF p_payment_method = 'cash' AND p_cash_received IS NOT NULL THEN
    IF p_cash_received < v_total THEN
      RAISE EXCEPTION 'Montant reçu insuffisant : il manque % F.', v_total - p_cash_received;
    END IF;
    v_received := p_cash_received;
  END IF;

  IF v_digits <> '' THEN
    SELECT p.id INTO v_customer FROM public.profiles p
     WHERE right(regexp_replace(COALESCE(p.phone,''), '\D', '', 'g'), 8) = right(v_digits, 8)
     ORDER BY p.created_at LIMIT 1;
  END IF;

  -- Le client d'une vente caisse vient UNIQUEMENT du numéro saisi,
  -- jamais du compte éventuellement connecté sur la tablette.
  UPDATE public.orders SET source = 'counter', dine_in = COALESCE(p_dine_in,false), cashier_id = c.id,
         paid_at = now(), customer_id = v_customer, table_label = v_table, cash_received_fcfa = v_received
   WHERE id = (v->>'order_id')::uuid;

  RETURN v || jsonb_build_object('cashier', c.full_name, 'dine_in', COALESCE(p_dine_in,false), 'table_label', v_table,
                                 'cash_received_fcfa', v_received,
                                 'change_fcfa', CASE WHEN v_received IS NULL THEN NULL ELSE v_received - v_total END,
                                 'points_linked', v_customer IS NOT NULL);
END $function$;
REVOKE ALL ON FUNCTION public.counter_place_order(text, jsonb, boolean, payment_method, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_place_order(text, jsonb, boolean, payment_method, text, text, text, text, integer) TO anon, authenticated, service_role;

-- Modifier une commande caisse tant que la cuisine ne l'a pas acceptée (même numéro, trace gardée).
CREATE OR REPLACE FUNCTION public.counter_update_order(
  p_token text, p_order_id uuid, p_items jsonb, p_dine_in boolean,
  p_table_label text DEFAULT NULL, p_extra_received integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE c public.cashiers; o public.orders; r public.restaurants; v_old jsonb; v_items integer; v_delta integer;
        v_received integer; v_table text; v_extra integer;
BEGIN
  c := private.counter_cashier(p_token);
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.restaurant_id <> c.restaurant_id OR o.source <> 'counter' THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF o.created_at < now() - interval '12 hours' THEN RAISE EXCEPTION 'Commande trop ancienne pour être modifiée à la caisse'; END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'Commande annulée : impossible de la modifier'; END IF;
  IF o.status <> 'received' THEN
    RAISE EXCEPTION 'Commande déjà acceptée par la cuisine : impossible de la modifier. Fais une nouvelle commande pour l''ajout.';
  END IF;
  IF p_extra_received IS NOT NULL AND p_extra_received < 0 THEN RAISE EXCEPTION 'Montant reçu invalide'; END IF;

  v_table := private.counter_table(p_dine_in, p_table_label);
  v_old := private.order_lines_json(o.id);
  DELETE FROM public.order_items WHERE order_id = o.id;
  v_items := private.order_fill_items(o.id, o.restaurant_id, p_items);
  SELECT * INTO r FROM public.restaurants WHERE id = o.restaurant_id;
  IF v_items < COALESCE(r.min_order_fcfa, 0) THEN RAISE EXCEPTION 'Commande minimum : % F (hors livraison).', r.min_order_fcfa; END IF;

  v_delta := v_items - o.total_fcfa;
  v_received := o.cash_received_fcfa;
  IF o.payment_method = 'cash' AND v_delta > 0 THEN
    v_extra := COALESCE(p_extra_received, v_delta);
    IF v_extra < v_delta THEN RAISE EXCEPTION 'Complément insuffisant : il manque % F.', v_delta - v_extra; END IF;
    IF p_extra_received IS NOT NULL OR v_received IS NOT NULL THEN
      v_received := COALESCE(v_received, o.total_fcfa) + v_extra;
    END IF;
  END IF;

  UPDATE public.orders
     SET items_total_fcfa = v_items, total_fcfa = v_items, discount_fcfa = 0,
         commission_fcfa = round(v_items * r.commission_rate / 100.0),
         dine_in = COALESCE(p_dine_in, false), table_label = v_table,
         note = private.counter_note(p_dine_in, v_table, NULL, true),
         cash_received_fcfa = v_received, edited_at = now()
   WHERE id = o.id;

  INSERT INTO public.order_edits (order_id, restaurant_id, cashier_id, author_name, old_total_fcfa, new_total_fcfa,
                                  extra_received_fcfa, old_items, new_items)
  VALUES (o.id, o.restaurant_id, c.id, c.full_name, o.total_fcfa, v_items,
          CASE WHEN o.payment_method = 'cash' AND v_delta > 0 THEN v_extra END, v_old, private.order_lines_json(o.id));

  RETURN jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'payment_method', o.payment_method,
    'old_total_fcfa', o.total_fcfa, 'total_fcfa', v_items, 'difference_fcfa', v_delta,
    'dine_in', COALESCE(p_dine_in, false), 'table_label', v_table,
    'cash_received_fcfa', v_received,
    'change_fcfa', CASE WHEN v_received IS NULL THEN NULL ELSE GREATEST(v_received - v_items, 0) END);
END $function$;
REVOKE ALL ON FUNCTION public.counter_update_order(text, uuid, jsonb, boolean, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_update_order(text, uuid, jsonb, boolean, text, integer) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.counter_update_order(text, uuid, jsonb, boolean, text, integer) IS 'Modifie une commande caisse avant acceptation cuisine : session caisse valide, même restaurant, prix recalculés, ancienne version gardée dans order_edits.';

CREATE OR REPLACE FUNCTION public.counter_recent_orders(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE c public.cashiers;
BEGIN
  c := private.counter_cashier(p_token);
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status,
            'total_fcfa', o.total_fcfa, 'customer_name', o.customer_name,
            'customer_phone', CASE WHEN o.customer_phone = '00000000' THEN NULL ELSE o.customer_phone END,
            'dine_in', o.dine_in, 'table_label', o.table_label,
            'payment_method', o.payment_method, 'cash_received_fcfa', o.cash_received_fcfa,
            'created_at', o.created_at, 'edited_at', o.edited_at, 'cancel_reason', o.cancel_reason,
            'lines', private.order_lines_json(o.id)) ORDER BY o.created_at DESC)
    FROM (SELECT * FROM public.orders WHERE restaurant_id = c.restaurant_id AND source = 'counter'
            AND created_at > now() - interval '12 hours' ORDER BY created_at DESC LIMIT 30) o), '[]'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.counter_day_summary(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE c public.cashiers; v_start timestamptz; r jsonb;
BEGIN
  c := private.counter_cashier(p_token);
  v_start := private.counter_period_start(c.id);
  SELECT jsonb_build_object(
    'period_start', v_start,
    'orders_count', count(*) FILTER (WHERE status <> 'cancelled'),
    'cancelled_count', count(*) FILTER (WHERE status = 'cancelled'),
    'edited_count', count(*) FILTER (WHERE status <> 'cancelled' AND edited_at IS NOT NULL),
    'cash_fcfa', COALESCE(sum(total_fcfa) FILTER (WHERE status <> 'cancelled' AND payment_method = 'cash'), 0),
    'momo_fcfa', COALESCE(sum(total_fcfa) FILTER (WHERE status <> 'cancelled' AND payment_method = 'mobile_money'), 0),
    'cash_received_fcfa', COALESCE(sum(cash_received_fcfa) FILTER (WHERE status <> 'cancelled' AND payment_method = 'cash'), 0),
    'change_fcfa', COALESCE(sum(GREATEST(cash_received_fcfa - total_fcfa, 0)) FILTER (WHERE status <> 'cancelled' AND payment_method = 'cash' AND cash_received_fcfa IS NOT NULL), 0)
  ) INTO r
  FROM public.orders
  WHERE source = 'counter' AND cashier_id = c.id AND created_at >= v_start;
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.counter_order_receipt(p_token text, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE c public.cashiers;
BEGIN
  c := private.counter_cashier(p_token);
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND restaurant_id = c.restaurant_id AND source = 'counter') THEN
    RAISE EXCEPTION 'Commande comptoir introuvable.';
  END IF;
  RETURN private.order_receipt_json(p_order_id);
END $function$;

-- Reçu groupé (une table, un groupe) : commandes caisse du même restaurant uniquement.
CREATE OR REPLACE FUNCTION public.counter_order_receipts(p_token text, p_order_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE c public.cashiers; v_ids uuid[];
BEGIN
  c := private.counter_cashier(p_token);
  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(COALESCE(p_order_ids, '{}')) x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'Choisis au moins une commande.'; END IF;
  IF cardinality(v_ids) > 20 THEN RAISE EXCEPTION 'Maximum 20 commandes sur un même reçu.'; END IF;
  IF (SELECT count(*) FROM public.orders WHERE id = ANY(v_ids) AND restaurant_id = c.restaurant_id AND source = 'counter') <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Commande comptoir introuvable.';
  END IF;
  RETURN (SELECT jsonb_agg(private.order_receipt_json(o.id) ORDER BY o.created_at) FROM public.orders o WHERE o.id = ANY(v_ids));
END $function$;
REVOKE ALL ON FUNCTION public.counter_order_receipts(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_order_receipts(text, uuid[]) TO anon, authenticated, service_role;

-- Gérante / direction : reçu de n'importe quelle commande (caisse, appli, site) de son restaurant.
CREATE OR REPLACE FUNCTION public.admin_order_receipts(p_order_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_ids uuid[]; v_rest uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(COALESCE(p_order_ids, '{}')) x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'Choisis au moins une commande.'; END IF;
  IF cardinality(v_ids) > 30 THEN RAISE EXCEPTION 'Maximum 30 commandes sur un même reçu.'; END IF;
  SELECT array_agg(DISTINCT restaurant_id) INTO v_rest FROM public.orders WHERE id = ANY(v_ids);
  IF (SELECT count(*) FROM public.orders WHERE id = ANY(v_ids)) <> cardinality(v_ids)
     OR NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', v_rest[1]) THEN
    RAISE EXCEPTION 'Commande introuvable.';
  END IF;
  IF cardinality(v_rest) > 1 THEN RAISE EXCEPTION 'Choisis des commandes d''un même restaurant.'; END IF;
  RETURN (SELECT jsonb_agg(private.order_receipt_json(o.id) ORDER BY o.created_at) FROM public.orders o WHERE o.id = ANY(v_ids));
END $function$;
REVOKE ALL ON FUNCTION public.admin_order_receipts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_order_receipts(uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_order_receipts(uuid[]) IS 'Reçus (simples ou groupés) pour la gérante/direction : commandes du restaurant qu''elle gère, montants enregistrés.';