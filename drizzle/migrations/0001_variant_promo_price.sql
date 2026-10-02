ALTER TABLE public.item_variants
  ADD COLUMN IF NOT EXISTS promo_price_fcfa integer,
  ADD COLUMN IF NOT EXISTS promo_ends_at timestamptz;
COMMENT ON COLUMN public.item_variants.promo_price_fcfa IS 'Prix promo (FCFA). Actif si plus bas que price_fcfa et promo_ends_at vide ou futur.';

CREATE OR REPLACE FUNCTION public.validate_variant_promo() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.promo_price_fcfa IS NOT NULL AND (NEW.promo_price_fcfa <= 0 OR NEW.promo_price_fcfa >= NEW.price_fcfa) THEN
    RAISE EXCEPTION 'Le prix promo doit être plus bas que le prix normal.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_variant_promo ON public.item_variants;
CREATE TRIGGER trg_validate_variant_promo BEFORE INSERT OR UPDATE OF promo_price_fcfa, price_fcfa ON public.item_variants
  FOR EACH ROW EXECUTE FUNCTION public.validate_variant_promo();

CREATE OR REPLACE FUNCTION public.effective_variant_price(v public.item_variants) RETURNS integer
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN v.promo_price_fcfa IS NOT NULL AND v.promo_price_fcfa > 0 AND v.promo_price_fcfa < v.price_fcfa
    AND (v.promo_ends_at IS NULL OR v.promo_ends_at > now()) THEN v.promo_price_fcfa ELSE v.price_fcfa END
$$;

CREATE OR REPLACE FUNCTION public.admin_set_variant_promo(p_variant_id uuid, p_promo_price integer, p_ends_at timestamptz)
RETURNS public.item_variants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.item_variants; v_rest uuid;
BEGIN
  SELECT m.restaurant_id INTO v_rest FROM public.item_variants v JOIN public.menu_items m ON m.id = v.menu_item_id WHERE v.id = p_variant_id;
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Formule introuvable.'; END IF;
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', v_rest) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  UPDATE public.item_variants SET promo_price_fcfa = NULLIF(p_promo_price, 0), promo_ends_at = p_ends_at
  WHERE id = p_variant_id RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_variant_promo(uuid, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_variant_promo(uuid, integer, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.place_order_base(p_restaurant_id uuid, p_customer_name text, p_customer_phone text, p_order_type order_type, p_items jsonb, p_delivery_zone_id uuid DEFAULT NULL::uuid, p_delivery_address text DEFAULT NULL::text, p_payment_method payment_method DEFAULT 'cash'::payment_method, p_note text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
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