-- Paiements en ligne FeexPay : la commande attend le paiement confirmé avant la cuisine.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS payment_url text,
  ADD COLUMN IF NOT EXISTS provider_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_to text,
  ADD COLUMN IF NOT EXISTS web_origin text,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.payments ALTER COLUMN provider SET DEFAULT 'feexpay';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_deadline timestamptz;
CREATE INDEX IF NOT EXISTS payments_pending_idx ON public.payments (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS payments_review_idx ON public.payments (created_at) WHERE needs_review AND reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_awaiting_payment_idx ON public.orders (created_at) WHERE status = 'awaiting_payment';

-- 1. Mise en attente à la création (uniquement quand place_order le demande)
CREATE OR REPLACE FUNCTION public.hold_prepaid_order()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(current_setting('bouff.pay_online', true), '') = '1'
     AND NEW.source <> 'counter' AND NEW.payment_method IN ('mobile_money','card') THEN
    NEW.status := 'awaiting_payment';
    NEW.payment_deadline := now() + interval '10 minutes';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_hold_prepaid ON public.orders;
CREATE TRIGGER orders_hold_prepaid BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.hold_prepaid_order();

-- 2. Une commande en attente ne part en cuisine que par la confirmation du paiement
CREATE OR REPLACE FUNCTION public.guard_payment_hold()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status = 'awaiting_payment' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
    IF NEW.status = 'received' AND COALESCE(current_setting('bouff.payment_confirmed', true), '') = '1' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Paiement non confirmé : la commande ne peut pas encore partir en cuisine.';
  END IF;
  IF NEW.status = 'awaiting_payment' AND OLD.status IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'Statut de paiement invalide.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_guard_payment_hold ON public.orders;
CREATE TRIGGER orders_guard_payment_hold BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_hold();

-- 3. place_order : nouveau paramètre p_pay_online (false par défaut = comportement inchangé)
DROP FUNCTION IF EXISTS public.place_order(uuid, text, text, order_type, jsonb, uuid, text, payment_method, text, text, boolean, integer, timestamptz);
CREATE FUNCTION public.place_order(p_restaurant_id uuid, p_customer_name text, p_customer_phone text, p_order_type order_type, p_items jsonb, p_delivery_zone_id uuid DEFAULT NULL::uuid, p_delivery_address text DEFAULT NULL::text, p_payment_method payment_method DEFAULT 'cash'::payment_method, p_note text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text, p_use_wallet boolean DEFAULT true, p_tip_fcfa integer DEFAULT 0, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_pay_online boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; o public.orders; q jsonb; u uuid := auth.uid(); v_items int; w_used int := 0; f_used boolean := false; v_total int; v_tip int := GREATEST(COALESCE(p_tip_fcfa,0),0);
  v_status text; v_deadline timestamptz;
BEGIN
  IF v_tip > 10000 THEN RAISE EXCEPTION 'Pourboire trop élevé (10 000 F maximum).'; END IF;
  IF p_order_type <> 'delivery' THEN v_tip := 0; END IF;
  IF p_scheduled_for IS NOT NULL THEN
    IF p_scheduled_for < now() + interval '30 minutes' THEN RAISE EXCEPTION 'Choisissez une heure au moins 30 minutes plus tard.'; END IF;
    IF p_scheduled_for > now() + interval '2 days' THEN RAISE EXCEPTION 'Vous pouvez programmer jusqu''à 2 jours à l''avance.'; END IF;
    IF NOT public.is_time_in_hours(p_restaurant_id, p_scheduled_for) THEN RAISE EXCEPTION 'Le restaurant est fermé à cette heure-là.'; END IF;
  END IF;
  IF COALESCE(p_pay_online, false) THEN
    IF p_payment_method NOT IN ('mobile_money','card') THEN
      RAISE EXCEPTION 'Paiement en ligne : choisissez Mobile Money ou carte bancaire.';
    END IF;
    PERFORM set_config('bouff.pay_online', '1', true);
  END IF;
  v := public.place_order_base(p_restaurant_id, p_customer_name, p_customer_phone, p_order_type, p_items, p_delivery_zone_id, p_delivery_address, p_payment_method, p_note, p_coupon_code);
  PERFORM set_config('bouff.pay_online', '', true);
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
  v_status := o.status::text; v_deadline := o.payment_deadline;
  IF o.status = 'awaiting_payment' THEN
    IF v_total = 0 THEN
      -- Tout est couvert par le portefeuille : rien à encaisser, la commande part en cuisine.
      PERFORM set_config('bouff.payment_confirmed', '1', true);
      UPDATE public.orders SET status = 'received', paid_at = now(), payment_deadline = NULL WHERE id = o.id;
      PERFORM set_config('bouff.payment_confirmed', '', true);
      v_status := 'received'; v_deadline := NULL;
    ELSIF v_total < 100 THEN
      RAISE EXCEPTION 'Montant trop faible pour un paiement en ligne (100 F minimum). Choisissez Espèces.';
    ELSIF v_total > 2000000 THEN
      RAISE EXCEPTION 'Montant trop élevé pour un paiement en ligne (2 000 000 F maximum).';
    END IF;
  END IF;
  RETURN v || jsonb_build_object('wallet_used_fcfa', w_used, 'free_delivery_used', f_used,
    'delivery_discount_fcfa', CASE WHEN f_used THEN o.delivery_fee_fcfa ELSE 0 END,
    'tip_fcfa', v_tip, 'scheduled_for', p_scheduled_for, 'total_fcfa', v_total,
    'status', v_status, 'payment_deadline', v_deadline);
END $function$;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, text, text, order_type, jsonb, uuid, text, payment_method, text, text, boolean, integer, timestamptz, boolean) TO anon, authenticated, service_role;

-- 4. Notifications : rien tant que le paiement n'est pas confirmé
CREATE OR REPLACE FUNCTION public.enqueue_order_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event text;
  v_restaurant record;
  v_payload jsonb;
  v_has_phone boolean := regexp_replace(COALESCE(NEW.customer_phone,''), '\D', '', 'g') !~ '^0+$';
  v_counter boolean := NEW.source = 'counter' OR COALESCE(current_setting('bouff.counter', true), '') = '1';
  v_unpaid_cancel boolean := false;
BEGIN
  IF v_counter THEN RETURN NEW; END IF;
  IF NEW.status = 'awaiting_payment' THEN RETURN NEW; END IF;
  IF NEW.delivery_mode='external' AND NEW.status IN ('on_the_way','delivered') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    v_event := 'order_received';
  ELSIF OLD.status = 'awaiting_payment' AND NEW.status = 'received' THEN
    v_event := 'order_received';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := 'status_' || NEW.status::text;
    v_unpaid_cancel := OLD.status = 'awaiting_payment' AND NEW.status = 'cancelled';
  ELSE
    RETURN NEW;
  END IF;

  SELECT name, whatsapp_number, phone INTO v_restaurant
  FROM public.restaurants WHERE id = NEW.restaurant_id;

  v_payload := jsonb_build_object(
    'order_number', NEW.order_number, 'status', NEW.status::text, 'order_type', NEW.order_type::text,
    'total_fcfa', NEW.total_fcfa, 'delivery_fee_fcfa', NEW.delivery_fee_fcfa,
    'customer_name', NEW.customer_name, 'customer_phone', NEW.customer_phone,
    'delivery_address', NEW.delivery_address, 'payment_method', NEW.payment_method::text,
    'restaurant_name', COALESCE(v_restaurant.name, 'BOUFF'), 'cancel_reason', NEW.cancel_reason
  );

  IF v_event IN ('order_received','status_in_kitchen','status_ready','status_on_the_way','status_delivered','status_cancelled') THEN
    IF v_has_phone THEN
      INSERT INTO public.notification_outbox (order_id, restaurant_id, event, channel, audience, recipient, payload)
      VALUES (NEW.id, NEW.restaurant_id, v_event, 'whatsapp', 'customer', NEW.customer_phone, v_payload);
    END IF;
    IF NEW.customer_id IS NOT NULL THEN
      INSERT INTO public.notification_outbox (order_id, restaurant_id, event, channel, audience, recipient, payload)
      VALUES (NEW.id, NEW.restaurant_id, v_event, 'email', 'customer', NULL, v_payload);
    END IF;
  END IF;

  -- Une commande jamais payée n'a jamais été envoyée au restaurant : pas d'alerte d'annulation.
  IF v_event IN ('order_received','status_cancelled') AND NOT v_unpaid_cancel THEN
    INSERT INTO public.notification_outbox (order_id, restaurant_id, event, channel, audience, recipient, payload)
    VALUES (NEW.id, NEW.restaurant_id, v_event, 'whatsapp', 'restaurant',
            COALESCE(v_restaurant.whatsapp_number, v_restaurant.phone), v_payload);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_customer_in_app()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_title text; v_body text;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.source = 'counter' OR COALESCE(current_setting('bouff.counter', true), '') = '1' THEN RETURN NEW; END IF;
  IF NEW.status = 'awaiting_payment' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_title := 'Commande ' || NEW.order_number;
  v_body := CASE NEW.status
    WHEN 'received' THEN CASE WHEN NEW.paid_at IS NOT NULL AND NEW.payment_method IN ('mobile_money','card') THEN 'Paiement confirmé : votre commande part en cuisine.' ELSE 'Nous avons bien reçu votre commande.' END
    WHEN 'in_kitchen' THEN 'Votre commande est en préparation en cuisine.'
    WHEN 'ready' THEN CASE WHEN NEW.order_type='takeaway' THEN 'Votre commande est prête, vous pouvez venir la récupérer.' ELSE 'Votre commande est prête, un livreur va la prendre.' END
    WHEN 'on_the_way' THEN 'Votre livreur est en route.'
    WHEN 'delivered' THEN CASE WHEN NEW.order_type='takeaway' THEN 'Commande récupérée. Bon appétit !' ELSE 'Commande livrée. Bon appétit !' END
    WHEN 'cancelled' THEN 'Votre commande a été annulée.' || COALESCE(' ' || NEW.cancel_reason, '')
  END;
  IF NEW.delivery_mode='external' THEN v_body := CASE NEW.status WHEN 'ready' THEN 'Votre commande est prête. Départ estimé dans 5 minutes.' WHEN 'on_the_way' THEN 'Votre commande est en livraison (suivi estimé).' WHEN 'delivered' THEN 'Votre commande a été clôturée automatiquement. La livraison n’a pas été confirmée par le coursier.' ELSE v_body END; END IF;
  IF v_body IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(user_id, order_id, title, body) VALUES (NEW.customer_id, NEW.id, v_title, v_body);
  RETURN NEW;
END $function$;

-- 5. Anti-abus : une commande en attente de paiement compte comme commande en cours
CREATE OR REPLACE FUNCTION public.guard_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.restaurants; v_phone text; v_active int; v_hour int;
BEGIN
  SELECT * INTO r FROM public.restaurants WHERE id = NEW.restaurant_id;
  IF r.is_temporarily_closed THEN
    RAISE EXCEPTION 'Le restaurant est fermé pour le moment. Réessayez plus tard.';
  END IF;
  IF NOT public.is_restaurant_open(NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Le restaurant est fermé. Ouvert de % à %.', to_char(r.opens_at, 'HH24"h"MI'), to_char(r.closes_at, 'HH24"h"MI');
  END IF;
  IF COALESCE(current_setting('bouff.counter', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  v_phone := regexp_replace(NEW.customer_phone, '\D', '', 'g');
  SELECT count(*) FILTER (WHERE status IN ('awaiting_payment','received','in_kitchen','ready','on_the_way')),
         count(*) FILTER (WHERE created_at > now() - interval '1 hour')
    INTO v_active, v_hour
    FROM public.orders
   WHERE regexp_replace(customer_phone, '\D', '', 'g') = v_phone
     AND created_at > now() - interval '1 day';
  IF v_active >= r.max_active_orders_per_phone THEN
    RAISE EXCEPTION 'Vous avez déjà % commandes en cours avec ce numéro.', v_active;
  END IF;
  IF v_hour >= r.max_orders_per_phone_hour THEN
    RAISE EXCEPTION 'Trop de commandes avec ce numéro. Réessayez dans une heure.';
  END IF;
  RETURN NEW;
END $function$;

-- 6. Annulation client : possible aussi en attente de paiement, sauf validation en cours
CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_number text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.orders;
BEGIN
  SELECT * INTO v FROM public.orders WHERE upper(order_number) = upper(btrim(p_order_number)) FOR UPDATE;
  IF v.id IS NULL OR NOT (
    (auth.uid() IS NOT NULL AND v.customer_id = auth.uid()) OR
    (p_phone IS NOT NULL AND regexp_replace(v.customer_phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g'))
  ) THEN
    RAISE EXCEPTION 'Commande introuvable.';
  END IF;
  IF v.status = 'awaiting_payment' THEN
    IF EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = v.id AND p.status = 'pending'
                AND p.created_at > now() - CASE WHEN p.method = 'card' THEN interval '15 minutes' ELSE interval '3 minutes' END) THEN
      RAISE EXCEPTION 'Un paiement est en cours de validation. Attendez son résultat avant d''annuler.';
    END IF;
    UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Annulée par le client avant paiement'
     WHERE id = v.id;
    RETURN jsonb_build_object('order_number', v.order_number, 'status', 'cancelled');
  END IF;
  IF v.status <> 'received' THEN
    RAISE EXCEPTION 'La cuisine a déjà accepté cette commande, elle ne peut plus être annulée.';
  END IF;
  UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Annulée par le client'
   WHERE id = v.id;
  RETURN jsonb_build_object('order_number', v.order_number, 'status', 'cancelled');
END $function$;

-- 7. La cuisine ne voit pas les commandes non payées (le responsable et la direction les voient)
DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated USING (
  (customer_id = auth.uid())
  OR (private.manages_restaurant(auth.uid(), restaurant_id) AND (
        status <> 'awaiting_payment'
        OR private.has_role(auth.uid(), 'super_admin'::app_role)
        OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                     AND ur.role = 'restaurant_admin'::app_role AND ur.restaurant_id = orders.restaurant_id)))
  OR (rider_id = private.current_rider_id())
  OR ((delivery_mode = 'internal') AND (rider_id IS NULL) AND (order_type = 'delivery'::order_type)
      AND (status = ANY (ARRAY['ready'::order_status, 'in_kitchen'::order_status]))
      AND (restaurant_id = private.current_rider_restaurant()))
);

-- 8. Fonctions réservées au serveur de paiement
CREATE OR REPLACE FUNCTION public.feexpay_alert_staff(p_order public.orders, p_title text, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.push_users(public.staff_ids(p_order.restaurant_id, ARRAY['restaurant_admin','super_admin']::app_role[]),
    p_title, p_body, jsonb_build_object('type', 'admin_alert', 'orderId', p_order.id));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'feexpay_alert_staff: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.feexpay_payment_json(p public.payments)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', p.id, 'reference', p.provider_ref, 'method', p.method, 'network', p.network,
    'status', CASE p.status WHEN 'completed' THEN 'successful' WHEN 'failed' THEN 'failed' WHEN 'cancelled' THEN 'failed' ELSE 'pending' END,
    'reason', p.failure_reason, 'paymentUrl', CASE WHEN p.status = 'pending' THEN p.payment_url END,
    'amount', p.amount_fcfa, 'createdAt', p.created_at, 'lastCheckedAt', p.last_checked_at,
    'returnTo', p.return_to, 'webOrigin', p.web_origin, 'phone', p.phone) END
$$;

CREATE OR REPLACE FUNCTION public.feexpay_order_state(p_order_number text, p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders; p public.payments; s public.payments;
BEGIN
  SELECT * INTO o FROM public.orders
   WHERE upper(order_number) = upper(btrim(p_order_number))
     AND regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')
     AND length(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')) >= 8;
  IF o.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.payments WHERE order_id = o.id AND provider = 'feexpay' ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO s FROM public.payments WHERE order_id = o.id AND provider = 'feexpay' AND status = 'completed' ORDER BY confirmed_at LIMIT 1;
  RETURN jsonb_build_object(
    'id', o.id, 'orderNumber', o.order_number, 'status', o.status::text, 'total', o.total_fcfa,
    'paymentMethod', o.payment_method::text, 'paid', o.paid_at IS NOT NULL, 'deadline', o.payment_deadline,
    'cancelReason', o.cancel_reason, 'customerName', o.customer_name, 'customerPhone', o.customer_phone,
    'latest', public.feexpay_payment_json(p), 'successful', public.feexpay_payment_json(s),
    'hasPendingRecent', EXISTS (SELECT 1 FROM public.payments x WHERE x.order_id = o.id AND x.status = 'pending'
        AND x.created_at > now() - CASE WHEN x.method = 'card' THEN interval '15 minutes' ELSE interval '3 minutes' END));
END $$;

CREATE OR REPLACE FUNCTION public.feexpay_record_attempt(p_order_id uuid, p_reference text, p_method text, p_network text,
  p_phone text, p_amount integer, p_status text, p_reason text, p_payment_url text, p_expires_at timestamptz,
  p_return_to text, p_web_origin text, p_raw jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v public.payments;
BEGIN
  INSERT INTO public.payments (order_id, provider, provider_ref, provider_correspondent, method, network, phone, amount_fcfa,
                               status, failure_reason, payment_url, provider_expires_at, return_to, web_origin, raw, last_checked_at)
  VALUES (p_order_id, 'feexpay', p_reference, p_network, p_method, p_network, COALESCE(p_phone, ''), p_amount,
          'pending', NULL, p_payment_url, p_expires_at, p_return_to, p_web_origin, p_raw, now())
  RETURNING * INTO v;
  IF p_status IS NOT NULL AND upper(p_status) <> 'PENDING' THEN
    RETURN public.feexpay_apply_result(p_reference, p_status, NULL, p_reason, p_raw);
  END IF;
  RETURN jsonb_build_object('found', true, 'changed', false, 'payment', public.feexpay_payment_json(v));
END $$;

CREATE OR REPLACE FUNCTION public.feexpay_apply_result(p_reference text, p_status text, p_amount integer DEFAULT NULL,
  p_reason text DEFAULT NULL, p_raw jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.payments; o public.orders; v_new text; v_review text; v_changed boolean := false;
BEGIN
  SELECT * INTO p FROM public.payments WHERE provider = 'feexpay' AND provider_ref = p_reference FOR UPDATE;
  IF p.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO o FROM public.orders WHERE id = p.order_id FOR UPDATE;
  v_new := CASE upper(btrim(COALESCE(p_status, '')))
             WHEN 'SUCCESSFUL' THEN 'completed' WHEN 'SUCCESS' THEN 'completed'
             WHEN 'FAILED' THEN 'failed' WHEN 'CANCELLED' THEN 'failed' WHEN 'CANCELED' THEN 'failed'
             ELSE 'pending' END;

  UPDATE public.payments SET last_checked_at = now(), raw = COALESCE(p_raw, raw) WHERE id = p.id;

  IF p.status = 'completed' OR v_new = 'pending' OR p.status = v_new THEN
    NULL; -- rien de nouveau (résultat déjà enregistré ou toujours en attente)
  ELSIF v_new = 'failed' THEN
    UPDATE public.payments SET status = 'failed',
      failure_reason = left(COALESCE(NULLIF(btrim(p_reason), ''), 'Paiement refusé.'), 300)
     WHERE id = p.id;
    v_changed := true;
  ELSE
    v_changed := true;
    UPDATE public.payments SET status = 'completed', confirmed_at = now(), failure_reason = NULL WHERE id = p.id;
    IF p_amount IS NOT NULL AND p_amount < p.amount_fcfa THEN
      v_review := 'Montant reçu (' || p_amount || ' F) inférieur au montant attendu (' || p.amount_fcfa || ' F).';
    ELSIF o.status = 'awaiting_payment' AND o.paid_at IS NULL THEN
      PERFORM set_config('bouff.payment_confirmed', '1', true);
      UPDATE public.orders SET status = 'received', paid_at = now() WHERE id = o.id;
      PERFORM set_config('bouff.payment_confirmed', '', true);
    ELSIF o.paid_at IS NOT NULL THEN
      v_review := 'Paiement en double : la commande était déjà payée.';
    ELSIF o.status = 'cancelled' THEN
      v_review := 'Paiement reçu après l''annulation de la commande.';
    ELSE
      v_review := 'Paiement reçu pour une commande qui n''attendait plus de paiement.';
    END IF;
    IF v_review IS NOT NULL THEN
      UPDATE public.payments SET needs_review = true, review_reason = v_review WHERE id = p.id;
      PERFORM public.feexpay_alert_staff(o, 'Paiement à vérifier', 'Commande ' || o.order_number || ' : ' || v_review || ' Remboursement ou régularisation à prévoir.');
    END IF;
  END IF;

  SELECT * INTO p FROM public.payments WHERE id = p.id;
  SELECT * INTO o FROM public.orders WHERE id = p.order_id;
  RETURN jsonb_build_object('found', true, 'changed', v_changed, 'orderStatus', o.status::text,
    'paid', o.paid_at IS NOT NULL, 'payment', public.feexpay_payment_json(p));
END $$;

CREATE OR REPLACE FUNCTION public.feexpay_pending_to_check(p_limit integer DEFAULT 25)
RETURNS TABLE(reference text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT provider_ref FROM public.payments
   WHERE provider = 'feexpay' AND status = 'pending' AND provider_ref IS NOT NULL
     AND created_at > now() - interval '2 days'
     AND (last_checked_at IS NULL OR last_checked_at < now() - interval '20 seconds')
   ORDER BY created_at
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50)
$$;

CREATE OR REPLACE FUNCTION public.feexpay_expire_due(p_grace interval DEFAULT interval '0 minutes')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  UPDATE public.orders o
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Paiement non reçu dans les 10 minutes.'
   WHERE o.status = 'awaiting_payment'
     AND o.payment_deadline < now() - COALESCE(p_grace, interval '0 minutes')
     AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id AND p.status = 'pending'
                       AND p.created_at > now() - CASE WHEN p.method = 'card' THEN interval '15 minutes' ELSE interval '5 minutes' END);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.feexpay_touch(p_reference text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.payments SET last_checked_at = now() WHERE provider = 'feexpay' AND provider_ref = p_reference;
$$;

REVOKE ALL ON FUNCTION public.feexpay_alert_staff(public.orders, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feexpay_payment_json(public.payments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feexpay_order_state(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feexpay_record_attempt(uuid, text, text, text, text, integer, text, text, text, timestamptz, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feexpay_apply_result(text, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feexpay_pending_to_check(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feexpay_expire_due(interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feexpay_touch(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_prepaid_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_payment_hold() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feexpay_payment_json(public.payments) TO service_role;
GRANT EXECUTE ON FUNCTION public.feexpay_order_state(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.feexpay_record_attempt(uuid, text, text, text, text, integer, text, text, text, timestamptz, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.feexpay_apply_result(text, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.feexpay_pending_to_check(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.feexpay_expire_due(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.feexpay_touch(text) TO service_role;

-- 9. Veille : vérification des paiements en attente + expiration à 10 minutes
CREATE OR REPLACE FUNCTION public.ops_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o record; n int := 0; k text;
BEGIN
  PERFORM public.external_delivery_tick();

  -- Paiements en ligne : on demande au serveur de paiement de revérifier chaque minute,
  -- puis filet de sécurité si ce serveur ne répond pas (5 min après l'échéance).
  IF EXISTS (SELECT 1 FROM orders WHERE status = 'awaiting_payment')
     OR EXISTS (SELECT 1 FROM payments WHERE provider = 'feexpay' AND status = 'pending' AND created_at > now() - interval '2 days') THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://txyqwlatzlkurjrnlxhe.supabase.co/functions/v1/feexpay/reconcile',
        body := '{}'::jsonb,
        headers := '{"Content-Type":"application/json","apikey":"sb_publishable_mL30STWaoMLv30cWEZnI8g_e_WZn8j3"}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ops_tick feexpay: %', SQLERRM;
    END;
    PERFORM public.feexpay_expire_due(interval '5 minutes');
  END IF;

  FOR o IN SELECT id, restaurant_id, order_number, COALESCE(paid_at, created_at) AS since FROM orders
            WHERE status = 'received' AND accepted_at IS NULL AND COALESCE(paid_at, created_at) < now() - interval '5 minutes'
              AND (scheduled_for IS NULL OR scheduled_for < now() + interval '45 minutes') LOOP
    k := 'accept5:' || o.id;
    IF NOT EXISTS (SELECT 1 FROM ops_alert_log WHERE key = k) THEN
      INSERT INTO ops_alert_log(key) VALUES (k);
      n := n + public.push_users(public.staff_ids(o.restaurant_id, ARRAY['kitchen','restaurant_admin']::app_role[]),
        'Commande en attente !', 'La commande ' || o.order_number || ' attend depuis 5 min. Accepte-la.',
        jsonb_build_object('type', 'kitchen_alert', 'orderId', o.id));
    END IF;
    k := 'accept10:' || o.id;
    IF o.since < now() - interval '10 minutes' AND NOT EXISTS (SELECT 1 FROM ops_alert_log WHERE key = k) THEN
      INSERT INTO ops_alert_log(key) VALUES (k);
      n := n + public.push_users(public.staff_ids(o.restaurant_id, ARRAY['restaurant_admin','super_admin']::app_role[]),
        'Cuisine en retard', 'La commande ' || o.order_number || ' n''est toujours pas acceptée après 10 min.',
        jsonb_build_object('type', 'admin_alert', 'orderId', o.id));
    END IF;
  END LOOP;

  FOR o IN SELECT id, restaurant_id, order_number FROM orders
            WHERE status = 'ready' AND order_type = 'delivery' AND rider_id IS NULL AND delivery_mode='internal'
              AND ready_at < now() - interval '10 minutes' LOOP
    k := 'norider:' || o.id;
    IF NOT EXISTS (SELECT 1 FROM ops_alert_log WHERE key = k) THEN
      INSERT INTO ops_alert_log(key) VALUES (k);
      n := n + public.push_users(public.staff_ids(o.restaurant_id, ARRAY['kitchen','restaurant_admin','super_admin']::app_role[]),
        'Pas de livreur', 'La commande ' || o.order_number || ' est prête depuis 10 min sans livreur.',
        jsonb_build_object('type', 'admin_alert', 'orderId', o.id));
    END IF;
  END LOOP;

  FOR o IN SELECT id, customer_id, order_number FROM orders
            WHERE status = 'delivered' AND customer_id IS NOT NULL
              AND delivered_at BETWEEN now() - interval '2 hours' AND now() - interval '30 minutes'
              AND NOT EXISTS (SELECT 1 FROM order_reviews r WHERE r.order_id = orders.id) LOOP
    k := 'review:' || o.id;
    IF NOT EXISTS (SELECT 1 FROM ops_alert_log WHERE key = k) THEN
      INSERT INTO ops_alert_log(key) VALUES (k);
      n := n + public.push_users(ARRAY[o.customer_id], 'C''était bon ?', 'Note ta commande ' || o.order_number || ', ça nous aide à faire mieux.',
        jsonb_build_object('type', 'REVIEW_ORDER', '_id', o.id));
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM orders WHERE status IN ('awaiting_payment','received','in_kitchen','ready','on_the_way')
                   AND (scheduled_for IS NULL OR scheduled_for < now() + interval '1 hour'))
     AND NOT EXISTS (SELECT 1 FROM payments WHERE provider = 'feexpay' AND status = 'pending' AND created_at > now() - interval '1 hour')
     AND NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.status = 'delivered' AND o2.customer_id IS NOT NULL
                       AND o2.delivered_at > now() - interval '35 minutes'
                       AND NOT EXISTS (SELECT 1 FROM ops_alert_log l WHERE l.key = 'review:' || o2.id)) THEN
    PERFORM cron.unschedule('bouff-ops-watch');
  END IF;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ops_tick: %', SQLERRM; RETURN n;
END $function$;

-- 10. Statistiques : une commande non payée n'est pas une vente
DO $$
DECLARE f record; d text; nd text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('admin_dashboard_counts','admin_order_breakdown','platform_stats','restaurant_stats','stats_compute','daily_ops_tick','admin_push_stats') LOOP
    d := pg_get_functiondef(f.oid);
    nd := regexp_replace(d, '(\m[a-z_]*\.?status)\s*<>\s*''cancelled''(::order_status)?', '\1 NOT IN (''cancelled'',''awaiting_payment'')', 'g');
    IF nd <> d THEN EXECUTE nd; END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.payments.provider_correspondent IS 'DEPRECATED: replaced by network';