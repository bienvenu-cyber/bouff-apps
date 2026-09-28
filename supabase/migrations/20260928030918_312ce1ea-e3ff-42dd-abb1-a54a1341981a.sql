ALTER TABLE public.reward_ledger DROP CONSTRAINT reward_ledger_kind_check;
ALTER TABLE public.reward_ledger ADD CONSTRAINT reward_ledger_kind_check CHECK (kind = ANY (ARRAY['wallet','free_delivery','points']));
ALTER TABLE public.reward_ledger DROP CONSTRAINT reward_ledger_reason_check;
ALTER TABLE public.reward_ledger ADD CONSTRAINT reward_ledger_reason_check CHECK (reason = ANY (ARRAY['welcome','loyalty','milestone','referral','refund','admin','used','reversal','redeemed']));

-- Points : expirés si aucune commande livrée depuis 12 mois
CREATE OR REPLACE FUNCTION public.reward_balance(p_user uuid, p_restaurant uuid, p_kind text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN p_kind = 'points' AND NOT EXISTS (
      SELECT 1 FROM public.orders WHERE customer_id = p_user AND restaurant_id = p_restaurant
        AND status = 'delivered' AND delivered_at > now() - interval '12 months') THEN 0
    ELSE (SELECT GREATEST(COALESCE(sum(amount),0),0)::int FROM public.reward_ledger
          WHERE user_id = p_user AND restaurant_id = p_restaurant AND kind = p_kind) END $$;

CREATE OR REPLACE FUNCTION public.points_catalog()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT '[{"id":"boisson","title":"Boisson offerte","points":100,"value_fcfa":500},
           {"id":"frites","title":"Frites offertes","points":200,"value_fcfa":1000},
           {"id":"burger","title":"Burger Classique offert","points":350,"value_fcfa":1500},
           {"id":"combo","title":"Combo offert","points":600,"value_fcfa":2500}]'::jsonb $$;

CREATE OR REPLACE FUNCTION public.redeem_points(p_reward text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u uuid := auth.uid(); r uuid := public.bouff_restaurant_id(); c jsonb; v_code text;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  SELECT e INTO c FROM jsonb_array_elements(public.points_catalog()) e WHERE e->>'id' = p_reward;
  IF c IS NULL THEN RAISE EXCEPTION 'Récompense inconnue.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rewards:' || u::text));
  IF public.reward_balance(u, r, 'points') < (c->>'points')::int THEN
    RAISE EXCEPTION 'Pas assez de points BOUFF.'; END IF;
  v_code := 'PT' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
  INSERT INTO public.coupons(restaurant_id, code, title, kind, value, max_discount_fcfa, min_order_fcfa, ends_at, max_uses, max_uses_per_customer, is_active, is_public)
    VALUES (r, v_code, c->>'title', 'fixed', (c->>'value_fcfa')::int, (c->>'value_fcfa')::int, (c->>'value_fcfa')::int, now() + interval '30 days', 1, 1, true, false);
  INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, note)
    VALUES (u, r, 'points', -(c->>'points')::int, 'redeemed', (c->>'title') || ' : code ' || v_code);
  RETURN jsonb_build_object('code', v_code, 'title', c->>'title', 'value_fcfa', (c->>'value_fcfa')::int,
    'points_left', public.reward_balance(u, r, 'points'));
END $$;
GRANT EXECUTE ON FUNCTION public.redeem_points(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.points_catalog() TO anon, authenticated;

DROP FUNCTION public.rewards_quote(uuid, integer, integer);
CREATE FUNCTION public.rewards_quote(p_restaurant uuid, p_items_after_discount integer, p_delivery_fee integer, p_use_wallet boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u uuid := auth.uid(); w int := 0; f int := 0; w_used int := 0; f_used boolean := false; due int;
BEGIN
  IF u IS NOT NULL AND p_restaurant = public.bouff_restaurant_id() THEN
    w := public.reward_balance(u, p_restaurant, 'wallet');
    f := public.reward_balance(u, p_restaurant, 'free_delivery');
    f_used := f > 0 AND COALESCE(p_delivery_fee,0) > 0;
    due := GREATEST(COALESCE(p_items_after_discount,0),0) + CASE WHEN f_used THEN 0 ELSE COALESCE(p_delivery_fee,0) END;
    IF p_use_wallet THEN w_used := LEAST(w, due); END IF;
  END IF;
  RETURN jsonb_build_object('wallet_fcfa', w, 'free_deliveries', f, 'wallet_used_fcfa', w_used, 'free_delivery_used', f_used,
    'delivery_discount_fcfa', CASE WHEN f_used THEN p_delivery_fee ELSE 0 END,
    'points', CASE WHEN u IS NULL THEN 0 ELSE public.reward_balance(u, p_restaurant, 'points') END);
END $$;
GRANT EXECUTE ON FUNCTION public.rewards_quote(uuid, integer, integer, boolean) TO anon, authenticated;

DROP FUNCTION public.place_order(uuid, text, text, order_type, jsonb, uuid, text, payment_method, text, text);
CREATE FUNCTION public.place_order(p_restaurant_id uuid, p_customer_name text, p_customer_phone text, p_order_type order_type, p_items jsonb, p_delivery_zone_id uuid DEFAULT NULL, p_delivery_address text DEFAULT NULL, p_payment_method payment_method DEFAULT 'cash', p_note text DEFAULT NULL, p_coupon_code text DEFAULT NULL, p_use_wallet boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb; o public.orders; q jsonb; u uuid := auth.uid(); v_items int; w_used int; f_used boolean; v_total int;
BEGIN
  v := public.place_order_base(p_restaurant_id, p_customer_name, p_customer_phone, p_order_type, p_items, p_delivery_zone_id, p_delivery_address, p_payment_method, p_note, p_coupon_code);
  IF u IS NULL OR p_restaurant_id IS DISTINCT FROM public.bouff_restaurant_id() THEN RETURN v; END IF;
  SELECT * INTO o FROM public.orders WHERE id = (v->>'order_id')::uuid FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtext('rewards:' || u::text));
  v_items := GREATEST(o.items_total_fcfa - o.discount_fcfa, 0);
  q := public.rewards_quote(p_restaurant_id, v_items, o.delivery_fee_fcfa, p_use_wallet);
  w_used := (q->>'wallet_used_fcfa')::int; f_used := (q->>'free_delivery_used')::boolean;
  IF w_used = 0 AND NOT f_used THEN RETURN v; END IF;
  v_total := GREATEST(v_items + CASE WHEN f_used THEN 0 ELSE o.delivery_fee_fcfa END - w_used, 0);
  UPDATE public.orders SET wallet_used_fcfa = w_used, free_delivery_used = f_used, total_fcfa = v_total WHERE id = o.id;
  IF w_used > 0 THEN INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note) VALUES (u, p_restaurant_id, 'wallet', -w_used, 'used', o.id, 'Payé avec le portefeuille'); END IF;
  IF f_used THEN INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note) VALUES (u, p_restaurant_id, 'free_delivery', -1, 'used', o.id, 'Livraison offerte utilisée'); END IF;
  RETURN v || jsonb_build_object('wallet_used_fcfa', w_used, 'free_delivery_used', f_used,
    'delivery_discount_fcfa', CASE WHEN f_used THEN o.delivery_fee_fcfa ELSE 0 END, 'total_fcfa', v_total);
END $$;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, text, text, order_type, jsonb, uuid, text, payment_method, text, text, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_order_rewards()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r uuid := public.bouff_restaurant_id(); n int; ref public.referrals; pts int; w_items int;
BEGIN
  IF NEW.status = OLD.status OR NEW.customer_id IS NULL OR NEW.restaurant_id IS DISTINCT FROM r THEN RETURN NEW; END IF;
  IF NEW.status = 'delivered' THEN
    -- Points BOUFF : 1 pt / 100 F payés sur les articles, 2 pts / 100 F payés avec le portefeuille
    w_items := LEAST(NEW.wallet_used_fcfa, GREATEST(NEW.items_total_fcfa - NEW.discount_fcfa, 0));
    pts := floor(GREATEST(NEW.items_total_fcfa - NEW.discount_fcfa - w_items, 0) / 100.0)::int
         + 2 * floor(w_items / 100.0)::int;
    IF pts > 0 THEN
      INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note)
        VALUES (NEW.customer_id, r, 'points', pts, 'loyalty', NEW.id,
          CASE WHEN w_items > 0 THEN 'Points BOUFF (doublés sur le portefeuille)' ELSE 'Points BOUFF' END) ON CONFLICT DO NOTHING;
    END IF;
    SELECT count(*) INTO n FROM public.orders WHERE customer_id = NEW.customer_id AND restaurant_id = r AND status = 'delivered';
    IF n > 0 AND n % 10 = 0 THEN
      INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note)
        VALUES (NEW.customer_id, r, 'free_delivery', 1, 'milestone', NEW.id, n || ' commandes : livraison offerte') ON CONFLICT DO NOTHING;
    END IF;
    SELECT * INTO ref FROM public.referrals WHERE restaurant_id = r AND referee_id = NEW.customer_id AND status = 'pending' FOR UPDATE;
    IF ref.id IS NOT NULL THEN
      UPDATE public.referrals SET status = 'rewarded', rewarded_order_id = NEW.id, rewarded_at = now() WHERE id = ref.id;
      INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note)
        VALUES (ref.referrer_id, r, 'free_delivery', 1, 'referral', NEW.id, 'Parrainage réussi : livraison offerte') ON CONFLICT DO NOTHING;
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note)
      SELECT user_id, restaurant_id, kind, -amount, 'reversal', order_id, 'Commande annulée : avantage rendu'
        FROM public.reward_ledger WHERE order_id = NEW.id AND reason = 'used'
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.my_rewards()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u uuid := auth.uid(); r uuid := public.bouff_restaurant_id(); v_code text;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, note)
    VALUES (u, r, 'free_delivery', 1, 'welcome', 'Livraison offerte de bienvenue') ON CONFLICT DO NOTHING;
  v_code := public.ensure_referral_code(u);
  RETURN jsonb_build_object(
    'wallet_fcfa', public.reward_balance(u, r, 'wallet'),
    'points', public.reward_balance(u, r, 'points'),
    'points_catalog', public.points_catalog(),
    'free_deliveries', public.reward_balance(u, r, 'free_delivery'),
    'referral_code', v_code,
    'referrals_total', (SELECT count(*) FROM public.referrals WHERE referrer_id = u AND restaurant_id = r),
    'referrals_rewarded', (SELECT count(*) FROM public.referrals WHERE referrer_id = u AND restaurant_id = r AND status = 'rewarded'),
    'delivered_orders', (SELECT count(*) FROM public.orders WHERE customer_id = u AND restaurant_id = r AND status = 'delivered'),
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'amount', l.amount, 'reason', l.reason, 'note', l.note, 'order_number', o.order_number, 'created_at', l.created_at) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.reward_ledger WHERE user_id = u AND restaurant_id = r ORDER BY created_at DESC LIMIT 100) l LEFT JOIN public.orders o ON o.id = l.order_id), '[]'::jsonb));
END $$;