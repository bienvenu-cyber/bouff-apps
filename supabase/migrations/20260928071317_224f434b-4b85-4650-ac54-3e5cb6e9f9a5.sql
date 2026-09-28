ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tip_fcfa integer NOT NULL DEFAULT 0 CHECK (tip_fcfa >= 0 AND tip_fcfa <= 10000);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE OR REPLACE FUNCTION public.is_time_in_hours(p_restaurant_id uuid, p_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.opens_at IS NULL OR r.closes_at IS NULL OR
    CASE WHEN r.opens_at <= r.closes_at
      THEN (p_at AT TIME ZONE 'Africa/Porto-Novo')::time >= r.opens_at AND (p_at AT TIME ZONE 'Africa/Porto-Novo')::time < r.closes_at
      ELSE (p_at AT TIME ZONE 'Africa/Porto-Novo')::time >= r.opens_at OR (p_at AT TIME ZONE 'Africa/Porto-Novo')::time < r.closes_at END
  FROM public.restaurants r WHERE r.id = p_restaurant_id
$$;

DROP FUNCTION IF EXISTS public.place_order(uuid, text, text, order_type, jsonb, uuid, text, payment_method, text, text, boolean);
CREATE FUNCTION public.place_order(p_restaurant_id uuid, p_customer_name text, p_customer_phone text, p_order_type order_type, p_items jsonb, p_delivery_zone_id uuid DEFAULT NULL, p_delivery_address text DEFAULT NULL, p_payment_method payment_method DEFAULT 'cash', p_note text DEFAULT NULL, p_coupon_code text DEFAULT NULL, p_use_wallet boolean DEFAULT true, p_tip_fcfa integer DEFAULT 0, p_scheduled_for timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v jsonb; o public.orders; q jsonb; u uuid := auth.uid(); v_items int; w_used int := 0; f_used boolean := false; v_total int; v_tip int := GREATEST(COALESCE(p_tip_fcfa,0),0);
BEGIN
  IF v_tip > 10000 THEN RAISE EXCEPTION 'Pourboire trop élevé (10 000 F maximum).'; END IF;
  IF p_order_type <> 'delivery' THEN v_tip := 0; END IF;
  IF p_scheduled_for IS NOT NULL THEN
    IF p_scheduled_for < now() + interval '30 minutes' THEN RAISE EXCEPTION 'Choisissez une heure au moins 30 minutes plus tard.'; END IF;
    IF p_scheduled_for > now() + interval '2 days' THEN RAISE EXCEPTION 'Vous pouvez programmer jusqu''à 2 jours à l''avance.'; END IF;
    IF NOT public.is_time_in_hours(p_restaurant_id, p_scheduled_for) THEN RAISE EXCEPTION 'Le restaurant est fermé à cette heure-là.'; END IF;
  END IF;
  v := public.place_order_base(p_restaurant_id, p_customer_name, p_customer_phone, p_order_type, p_items, p_delivery_zone_id, p_delivery_address, p_payment_method, p_note, p_coupon_code);
  SELECT * INTO o FROM public.orders WHERE id = (v->>'order_id')::uuid FOR UPDATE;
  v_items := GREATEST(o.items_total_fcfa - o.discount_fcfa, 0);
  IF u IS NOT NULL AND p_restaurant_id = public.bouff_restaurant_id() THEN
    PERFORM pg_advisory_xact_lock(hashtext('rewards:' || u::text));
    q := public.rewards_quote(p_restaurant_id, v_items, o.delivery_fee_fcfa, p_use_wallet);
    w_used := (q->>'wallet_used_fcfa')::int; f_used := (q->>'free_delivery_used')::boolean;
  END IF;
  v_total := GREATEST(v_items + CASE WHEN f_used THEN 0 ELSE o.delivery_fee_fcfa END - w_used, 0) + v_tip;
  UPDATE public.orders SET wallet_used_fcfa = w_used, free_delivery_used = f_used, tip_fcfa = v_tip, scheduled_for = p_scheduled_for, total_fcfa = v_total WHERE id = o.id;
  IF w_used > 0 THEN INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note) VALUES (u, p_restaurant_id, 'wallet', -w_used, 'used', o.id, 'Payé avec le portefeuille'); END IF;
  IF f_used THEN INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note) VALUES (u, p_restaurant_id, 'free_delivery', -1, 'used', o.id, 'Livraison offerte utilisée'); END IF;
  RETURN v || jsonb_build_object('wallet_used_fcfa', w_used, 'free_delivery_used', f_used,
    'delivery_discount_fcfa', CASE WHEN f_used THEN o.delivery_fee_fcfa ELSE 0 END,
    'tip_fcfa', v_tip, 'scheduled_for', p_scheduled_for, 'total_fcfa', v_total);
END $function$;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, text, text, order_type, jsonb, uuid, text, payment_method, text, text, boolean, integer, timestamptz) TO anon, authenticated;

-- Avis
CREATE TABLE public.order_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid,
  customer_name text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_reviews TO authenticated;
GRANT ALL ON public.order_reviews TO service_role;
ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read reviews" ON public.order_reviews FOR SELECT TO authenticated USING (private.manages_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "Customers read own reviews" ON public.order_reviews FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.submit_order_review(p_order_number text, p_phone text, p_rating integer, p_comment text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Note invalide (1 à 5).'; END IF;
  SELECT * INTO o FROM public.orders WHERE upper(order_number) = upper(btrim(p_order_number))
    AND regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace(COALESCE(p_phone,''), '\D', '', 'g');
  IF o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable.'; END IF;
  IF o.status <> 'delivered' THEN RAISE EXCEPTION 'Vous pourrez noter la commande une fois livrée.'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_reviews WHERE order_id = o.id) THEN RAISE EXCEPTION 'Vous avez déjà noté cette commande.'; END IF;
  INSERT INTO public.order_reviews(order_id, restaurant_id, user_id, customer_name, rating, comment)
  VALUES (o.id, o.restaurant_id, COALESCE(auth.uid(), o.customer_id), o.customer_name, p_rating, NULLIF(btrim(left(p_comment, 500)), ''));
  RETURN jsonb_build_object('ok', true, 'rating', p_rating);
END $$;
GRANT EXECUTE ON FUNCTION public.submit_order_review(text, text, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.restaurant_rating(p_restaurant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('average', COALESCE(round(avg(rating)::numeric, 1), 0), 'count', count(*))
  FROM public.order_reviews WHERE restaurant_id = p_restaurant_id
$$;
GRANT EXECUTE ON FUNCTION public.restaurant_rating(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_reviews(p_restaurant_id uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_restaurant_id IS NULL AND NOT private.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  IF p_restaurant_id IS NOT NULL AND NOT private.manages_restaurant(auth.uid(), p_restaurant_id) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(x) FROM (
    SELECT rv.id, rv.rating, rv.comment, rv.customer_name, rv.created_at, o.order_number, r.name AS restaurant
    FROM public.order_reviews rv JOIN public.orders o ON o.id = rv.order_id JOIN public.restaurants r ON r.id = rv.restaurant_id
    WHERE p_restaurant_id IS NULL OR rv.restaurant_id = p_restaurant_id
    ORDER BY rv.created_at DESC LIMIT LEAST(p_limit, 200)) x), '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_reviews(uuid, integer) TO authenticated;

-- Compteurs du tableau de bord
CREATE OR REPLACE FUNCTION public.admin_dashboard_counts(p_restaurant_id uuid DEFAULT NULL, p_from date DEFAULT ((now() AT TIME ZONE 'Africa/Porto-Novo')::date - 29), p_to date DEFAULT (now() AT TIME ZONE 'Africa/Porto-Novo')::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_restaurant_id IS NULL AND NOT private.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  IF p_restaurant_id IS NOT NULL AND NOT private.manages_restaurant(auth.uid(), p_restaurant_id) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  RETURN jsonb_build_object(
    'online_stores', (SELECT count(*) FROM public.restaurants r WHERE r.is_active AND NOT r.is_temporarily_closed AND (p_restaurant_id IS NULL OR r.id = p_restaurant_id)),
    'cancelled_orders', (SELECT count(*) FROM public.orders o WHERE o.status = 'cancelled' AND (p_restaurant_id IS NULL OR o.restaurant_id = p_restaurant_id) AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN p_from AND p_to),
    'delayed_orders', (SELECT count(*) FROM public.orders o WHERE (p_restaurant_id IS NULL OR o.restaurant_id = p_restaurant_id)
        AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN p_from AND p_to
        AND o.status <> 'cancelled'
        AND ((o.status IN ('received','in_kitchen') AND o.estimated_ready_at IS NOT NULL AND now() > o.estimated_ready_at + interval '10 minutes')
          OR (o.status IN ('received','in_kitchen','ready','on_the_way') AND now() > COALESCE(o.scheduled_for, o.created_at) + interval '60 minutes')
          OR (o.status = 'delivered' AND o.delivered_at > COALESCE(o.scheduled_for, o.created_at) + interval '60 minutes'))),
    'ratings', (SELECT count(*) FROM public.order_reviews rv WHERE p_restaurant_id IS NULL OR rv.restaurant_id = p_restaurant_id),
    'average_rating', (SELECT COALESCE(round(avg(rating)::numeric, 1), 0) FROM public.order_reviews rv WHERE p_restaurant_id IS NULL OR rv.restaurant_id = p_restaurant_id)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_counts(uuid, date, date) TO authenticated;

-- Crédit admin : portefeuille, livraisons offertes, points
CREATE OR REPLACE FUNCTION public.admin_grant_reward(p_user uuid, p_kind text, p_amount integer, p_reason text DEFAULT 'admin', p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $grant$
DECLARE r uuid := public.bouff_restaurant_id(); v_max int := (CASE p_kind WHEN 'wallet' THEN 100000 WHEN 'points' THEN 5000 ELSE 20 END);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND (ur.role = 'super_admin' OR (ur.role = 'restaurant_admin' AND ur.restaurant_id = r))) THEN
    RAISE EXCEPTION 'Accès refusé.'; END IF;
  IF p_kind NOT IN ('wallet','free_delivery','points') OR p_reason NOT IN ('admin','refund') OR COALESCE(p_amount,0) = 0 THEN RAISE EXCEPTION 'Paramètres invalides.'; END IF;
  IF abs(p_amount) > v_max THEN RAISE EXCEPTION 'Montant trop élevé.'; END IF;
  IF p_amount < 0 AND public.reward_balance(p_user, r, p_kind) + p_amount < 0 THEN RAISE EXCEPTION 'Solde insuffisant.'; END IF;
  INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, note, created_by) VALUES (p_user, r, p_kind, p_amount, p_reason, NULLIF(btrim(p_note),''), auth.uid());
  RETURN jsonb_build_object('wallet_fcfa', public.reward_balance(p_user, r, 'wallet'), 'free_deliveries', public.reward_balance(p_user, r, 'free_delivery'), 'points', public.reward_balance(p_user, r, 'points'));
END;
$grant$;

CREATE OR REPLACE FUNCTION public.admin_customer_rewards(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r uuid := public.bouff_restaurant_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND (ur.role = 'super_admin' OR (ur.role = 'restaurant_admin' AND ur.restaurant_id = r))) THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  RETURN jsonb_build_object('wallet_fcfa', public.reward_balance(p_user, r, 'wallet'), 'free_deliveries', public.reward_balance(p_user, r, 'free_delivery'), 'points', public.reward_balance(p_user, r, 'points'),
    'history', COALESCE((SELECT jsonb_agg(x) FROM (SELECT kind, amount, reason, note, created_at FROM public.reward_ledger WHERE user_id = p_user AND restaurant_id = r ORDER BY created_at DESC LIMIT 30) x), '[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_customer_rewards(uuid) TO authenticated;

-- Suivi : pourboire, heure programmée, avis
CREATE OR REPLACE FUNCTION public.track_order(p_order_number text, p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'order_type', o.order_type,
    'total_fcfa', o.total_fcfa, 'delivery_fee_fcfa', o.delivery_fee_fcfa,
    'items_total_fcfa', o.items_total_fcfa, 'discount_fcfa', o.discount_fcfa, 'coupon_code', o.coupon_code,
    'tip_fcfa', o.tip_fcfa, 'scheduled_for', o.scheduled_for,
    'review_rating', (SELECT rv.rating FROM public.order_reviews rv WHERE rv.order_id = o.id),
    'created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at,
    'picked_up_at', o.picked_up_at, 'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at,
    'cancel_reason', o.cancel_reason, 'restaurant', r.name,
    'rider_name', rd.full_name, 'rider_phone', rd.phone,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'item_name', i.item_name, 'variant_name', i.variant_name, 'quantity', i.quantity,
        'line_total_fcfa', i.line_total_fcfa,
        'options', COALESCE((SELECT jsonb_agg(oo.name) FROM public.order_item_options oo WHERE oo.order_item_id = i.id), '[]'::jsonb)
      ) ORDER BY i.created_at)
      FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb)
  ) INTO v
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  LEFT JOIN public.riders rd ON rd.id = o.rider_id
  WHERE upper(o.order_number) = upper(btrim(p_order_number))
    AND regexp_replace(o.customer_phone, '\D', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF v IS NULL THEN RAISE EXCEPTION 'Commande introuvable.'; END IF;
  RETURN v;
END $function$;