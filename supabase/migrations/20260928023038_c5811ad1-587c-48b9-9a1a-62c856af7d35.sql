CREATE OR REPLACE FUNCTION public.bouff_restaurant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT id FROM public.restaurants WHERE slug = 'bouff' LIMIT 1 $$;

CREATE TABLE public.reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('wallet','free_delivery')),
  amount integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('welcome','loyalty','milestone','referral','refund','admin','used','reversal')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reward_ledger_user_idx ON public.reward_ledger(user_id, restaurant_id, kind);
CREATE UNIQUE INDEX reward_ledger_welcome_uq ON public.reward_ledger(user_id, restaurant_id) WHERE reason = 'welcome';
CREATE UNIQUE INDEX reward_ledger_order_uq ON public.reward_ledger(order_id, user_id, kind, reason) WHERE order_id IS NOT NULL AND reason IN ('loyalty','milestone','used','reversal','referral');
GRANT SELECT ON public.reward_ledger TO authenticated;
GRANT ALL ON public.reward_ledger TO service_role;
ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client voit ses gains" ON public.reward_ledger FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins voient les gains" ON public.reward_ledger FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND (ur.role = 'super_admin' OR (ur.role = 'restaurant_admin' AND ur.restaurant_id = reward_ledger.restaurant_id))));

CREATE TABLE public.referral_codes (
  user_id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client voit son code" ON public.referral_codes FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rewarded','cancelled')),
  rewarded_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  UNIQUE (restaurant_id, referee_id)
);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client voit ses parrainages" ON public.referrals FOR SELECT TO authenticated USING (referrer_id = auth.uid() OR referee_id = auth.uid());
CREATE POLICY "Admins voient les parrainages" ON public.referrals FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND (ur.role = 'super_admin' OR (ur.role = 'restaurant_admin' AND ur.restaurant_id = referrals.restaurant_id))));

ALTER TABLE public.orders ADD COLUMN wallet_used_fcfa integer NOT NULL DEFAULT 0,
  ADD COLUMN free_delivery_used boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.reward_balance(p_user uuid, p_restaurant uuid, p_kind text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(COALESCE(sum(amount),0),0)::int FROM public.reward_ledger WHERE user_id = p_user AND restaurant_id = p_restaurant AND kind = p_kind $$;
REVOKE EXECUTE ON FUNCTION public.reward_balance(uuid,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_referral_code(p_user uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text; i int := 0;
BEGIN
  SELECT code INTO v FROM public.referral_codes WHERE user_id = p_user;
  IF v IS NOT NULL THEN RETURN v; END IF;
  LOOP
    v := 'BF' || upper(substr(translate(encode(gen_random_bytes(6),'base64'),'+/=0O1lI',''),1,6));
    BEGIN
      INSERT INTO public.referral_codes(user_id, code) VALUES (p_user, v);
      RETURN v;
    EXCEPTION WHEN unique_violation THEN
      i := i + 1; IF i > 10 THEN RAISE; END IF;
      SELECT code INTO v FROM public.referral_codes WHERE user_id = p_user;
      IF v IS NOT NULL THEN RETURN v; END IF;
    END;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.ensure_referral_code(uuid) FROM PUBLIC, anon, authenticated;

-- Résumé des gains du client connecté (crée le code et la livraison de bienvenue au besoin)
CREATE OR REPLACE FUNCTION public.my_rewards()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); r uuid := public.bouff_restaurant_id(); v_code text;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, note)
    VALUES (u, r, 'free_delivery', 1, 'welcome', 'Livraison offerte de bienvenue')
    ON CONFLICT DO NOTHING;
  v_code := public.ensure_referral_code(u);
  RETURN jsonb_build_object(
    'wallet_fcfa', public.reward_balance(u, r, 'wallet'),
    'free_deliveries', public.reward_balance(u, r, 'free_delivery'),
    'referral_code', v_code,
    'referrals_total', (SELECT count(*) FROM public.referrals WHERE referrer_id = u AND restaurant_id = r),
    'referrals_rewarded', (SELECT count(*) FROM public.referrals WHERE referrer_id = u AND restaurant_id = r AND status = 'rewarded'),
    'delivered_orders', (SELECT count(*) FROM public.orders WHERE customer_id = u AND restaurant_id = r AND status = 'delivered'),
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'amount', l.amount, 'reason', l.reason, 'note', l.note, 'order_number', o.order_number, 'created_at', l.created_at) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.reward_ledger WHERE user_id = u AND restaurant_id = r ORDER BY created_at DESC LIMIT 100) l LEFT JOIN public.orders o ON o.id = l.order_id), '[]'::jsonb)
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.my_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_rewards() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_referral_code(p_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.referral_codes WHERE upper(code) = upper(btrim(COALESCE(p_code,'')))) $$;
GRANT EXECUTE ON FUNCTION public.check_referral_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_referral_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); r uuid := public.bouff_restaurant_id(); v_ref uuid; v_code text := upper(btrim(COALESCE(p_code,'')));
BEGIN
  IF u IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Connecte-toi pour utiliser un code de parrainage.'); END IF;
  SELECT user_id INTO v_ref FROM public.referral_codes WHERE upper(code) = v_code;
  IF v_ref IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Code de parrainage introuvable.'); END IF;
  IF v_ref = u THEN RETURN jsonb_build_object('success', false, 'message', 'Tu ne peux pas utiliser ton propre code.'); END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE restaurant_id = r AND referee_id = u) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tu as déjà utilisé un code de parrainage.'); END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE customer_id = u AND restaurant_id = r AND status = 'delivered') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Le parrainage est réservé aux nouveaux clients.'); END IF;
  INSERT INTO public.referrals(restaurant_id, referrer_id, referee_id, code) VALUES (r, v_ref, u, v_code);
  INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, note)
    VALUES (u, r, 'free_delivery', 1, 'referral', 'Parrainage : livraison offerte');
  RETURN jsonb_build_object('success', true, 'message', 'Code accepté : une livraison offerte t''attend !');
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_referral_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;

-- Aperçu des avantages applicables (pour le récapitulatif avant commande)
CREATE OR REPLACE FUNCTION public.rewards_quote(p_restaurant uuid, p_items_after_discount integer, p_delivery_fee integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); w int := 0; f int := 0; w_used int := 0; f_used boolean := false;
BEGIN
  IF u IS NOT NULL AND p_restaurant = public.bouff_restaurant_id() THEN
    w := public.reward_balance(u, p_restaurant, 'wallet');
    f := public.reward_balance(u, p_restaurant, 'free_delivery');
    f_used := f > 0 AND COALESCE(p_delivery_fee,0) > 0;
    w_used := LEAST(w, floor(GREATEST(COALESCE(p_items_after_discount,0),0) * 0.5)::int);
  END IF;
  RETURN jsonb_build_object('wallet_fcfa', w, 'free_deliveries', f, 'wallet_used_fcfa', w_used, 'free_delivery_used', f_used,
    'delivery_discount_fcfa', CASE WHEN f_used THEN p_delivery_fee ELSE 0 END);
END $$;
REVOKE EXECUTE ON FUNCTION public.rewards_quote(uuid,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rewards_quote(uuid,integer,integer) TO authenticated;

-- La commande garde toute sa logique ; on applique ensuite les avantages
ALTER FUNCTION public.place_order(uuid,text,text,order_type,jsonb,uuid,text,payment_method,text,text) RENAME TO place_order_base;
REVOKE EXECUTE ON FUNCTION public.place_order_base(uuid,text,text,order_type,jsonb,uuid,text,payment_method,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_order(p_restaurant_id uuid, p_customer_name text, p_customer_phone text, p_order_type order_type, p_items jsonb, p_delivery_zone_id uuid DEFAULT NULL, p_delivery_address text DEFAULT NULL, p_payment_method payment_method DEFAULT 'cash', p_note text DEFAULT NULL, p_coupon_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; o public.orders; q jsonb; u uuid := auth.uid(); v_items int; w_used int; f_used boolean; v_total int;
BEGIN
  v := public.place_order_base(p_restaurant_id, p_customer_name, p_customer_phone, p_order_type, p_items, p_delivery_zone_id, p_delivery_address, p_payment_method, p_note, p_coupon_code);
  IF u IS NULL OR p_restaurant_id IS DISTINCT FROM public.bouff_restaurant_id() THEN RETURN v; END IF;
  SELECT * INTO o FROM public.orders WHERE id = (v->>'order_id')::uuid FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtext('rewards:' || u::text));
  v_items := GREATEST(o.items_total_fcfa - o.discount_fcfa, 0);
  q := public.rewards_quote(p_restaurant_id, v_items, o.delivery_fee_fcfa);
  w_used := (q->>'wallet_used_fcfa')::int; f_used := (q->>'free_delivery_used')::boolean;
  IF w_used = 0 AND NOT f_used THEN RETURN v; END IF;
  v_total := (v_items - w_used) + CASE WHEN f_used THEN 0 ELSE o.delivery_fee_fcfa END;
  UPDATE public.orders SET wallet_used_fcfa = w_used, free_delivery_used = f_used, total_fcfa = v_total WHERE id = o.id;
  IF w_used > 0 THEN INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note) VALUES (u, p_restaurant_id, 'wallet', -w_used, 'used', o.id, 'Payé avec le portefeuille'); END IF;
  IF f_used THEN INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note) VALUES (u, p_restaurant_id, 'free_delivery', -1, 'used', o.id, 'Livraison offerte utilisée'); END IF;
  RETURN v || jsonb_build_object('wallet_used_fcfa', w_used, 'free_delivery_used', f_used,
    'delivery_discount_fcfa', CASE WHEN f_used THEN o.delivery_fee_fcfa ELSE 0 END, 'total_fcfa', v_total);
END $$;
GRANT EXECUTE ON FUNCTION public.place_order(uuid,text,text,order_type,jsonb,uuid,text,payment_method,text,text) TO anon, authenticated;

-- Gains automatiques à la livraison, remboursement à l'annulation
CREATE OR REPLACE FUNCTION public.handle_order_rewards()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid := public.bouff_restaurant_id(); n int; ref public.referrals; pts int;
BEGIN
  IF NEW.status = OLD.status OR NEW.customer_id IS NULL OR NEW.restaurant_id IS DISTINCT FROM r THEN RETURN NEW; END IF;
  IF NEW.status = 'delivered' THEN
    pts := floor(GREATEST(NEW.items_total_fcfa - NEW.discount_fcfa - NEW.wallet_used_fcfa, 0) * 0.01)::int;
    IF pts > 0 THEN
      INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note)
        VALUES (NEW.customer_id, r, 'wallet', pts, 'loyalty', NEW.id, 'Fidélité : 1 % de ta commande') ON CONFLICT DO NOTHING;
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
REVOKE EXECUTE ON FUNCTION public.handle_order_rewards() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER orders_rewards AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_order_rewards();

-- Geste commercial / remboursement par un admin BOUFF
CREATE OR REPLACE FUNCTION public.admin_grant_reward(p_user uuid, p_kind text, p_amount integer, p_reason text DEFAULT 'admin', p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid := public.bouff_restaurant_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND (ur.role = 'super_admin' OR (ur.role = 'restaurant_admin' AND ur.restaurant_id = r))) THEN
    RAISE EXCEPTION 'Accès refusé.'; END IF;
  IF p_kind NOT IN ('wallet','free_delivery') OR p_reason NOT IN ('admin','refund') OR COALESCE(p_amount,0) = 0 THEN RAISE EXCEPTION 'Paramètres invalides.'; END IF;
  IF p_amount < 0 AND public.reward_balance(p_user, r, p_kind) + p_amount < 0 THEN RAISE EXCEPTION 'Solde insuffisant.'; END IF;
  INSERT INTO public.reward_ledger(user_id, restaurant_id, kind, amount, reason, note, created_by) VALUES (p_user, r, p_kind, p_amount, p_reason, p_note, auth.uid());
  RETURN jsonb_build_object('wallet_fcfa', public.reward_balance(p_user, r, 'wallet'), 'free_deliveries', public.reward_balance(p_user, r, 'free_delivery'));
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_grant_reward(uuid,text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_reward(uuid,text,integer,text,text) TO authenticated;