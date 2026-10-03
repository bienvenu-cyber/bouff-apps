-- lovable-cron-fallback-reviewed: kitchen 5/10-minute alerts need minute precision; job is woken on new order and unschedules itself when no order is in progress.
CREATE TABLE public.ops_alert_log (
  key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ops_alert_log TO service_role;
ALTER TABLE public.ops_alert_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS out_of_stock_at timestamptz;
ALTER TABLE public.item_variants ADD COLUMN IF NOT EXISTS out_of_stock_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_item_availability(p_menu_item_id uuid, p_available boolean)
 RETURNS menu_items LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_item public.menu_items;
BEGIN
  SELECT * INTO v_item FROM public.menu_items WHERE id = p_menu_item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Article introuvable.'; END IF;
  IF NOT private.manages_restaurant(auth.uid(), v_item.restaurant_id) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  UPDATE public.menu_items SET is_available = p_available,
    out_of_stock_at = CASE WHEN p_available THEN NULL ELSE now() END
  WHERE id = p_menu_item_id RETURNING * INTO v_item;
  RETURN v_item;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_variant_availability(p_variant_id uuid, p_available boolean)
 RETURNS item_variants LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_variant public.item_variants; v_rest uuid;
BEGIN
  SELECT * INTO v_variant FROM public.item_variants WHERE id = p_variant_id;
  IF v_variant.id IS NULL THEN RAISE EXCEPTION 'Formule introuvable.'; END IF;
  SELECT m.restaurant_id INTO v_rest FROM public.menu_items m WHERE m.id = v_variant.menu_item_id;
  IF NOT private.manages_restaurant(auth.uid(), v_rest) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  UPDATE public.item_variants SET is_available = p_available,
    out_of_stock_at = CASE WHEN p_available THEN NULL ELSE now() END
  WHERE id = p_variant_id RETURNING * INTO v_variant;
  RETURN v_variant;
END; $function$;

CREATE OR REPLACE FUNCTION public.push_users(p_users uuid[], p_title text, p_body text, p_data jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_msgs jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('to', t.token, 'title', p_title, 'body', p_body, 'sound', 'default',
           'priority', 'high', 'channelId', 'default', 'data', COALESCE(p_data, '{}'::jsonb)))
    INTO v_msgs FROM push_tokens t WHERE t.user_id = ANY(p_users) AND t.order_updates;
  IF v_msgs IS NULL THEN RETURN 0; END IF;
  BEGIN
    PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := v_msgs,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'push non envoyé: %', SQLERRM;
  END;
  RETURN jsonb_array_length(v_msgs);
END $$;
REVOKE ALL ON FUNCTION public.push_users(uuid[], text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_ids(p_restaurant uuid, p_roles app_role[])
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT user_id), '{}') FROM user_roles
   WHERE role = ANY(p_roles) AND (restaurant_id = p_restaurant OR role = 'super_admin');
$$;
REVOKE ALL ON FUNCTION public.staff_ids(uuid, app_role[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.alert_bad_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF NEW.rating > 2 THEN RETURN NEW; END IF;
  SELECT order_number, customer_name, customer_phone INTO o FROM orders WHERE id = NEW.order_id;
  PERFORM public.push_users(public.staff_ids(NEW.restaurant_id, ARRAY['restaurant_admin','super_admin']::app_role[]),
    'Mauvaise note : ' || NEW.rating || '/5',
    COALESCE(o.customer_name, 'Client') || ' (' || COALESCE(o.customer_phone, '?') || '), commande ' || COALESCE(o.order_number, '') ||
      COALESCE(' : « ' || left(NEW.comment, 120) || ' »', '') || '. Rappelle-le vite.',
    jsonb_build_object('type', 'bad_review', 'orderId', NEW.order_id));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'alert_bad_review: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER order_reviews_bad_alert AFTER INSERT ON public.order_reviews
  FOR EACH ROW EXECUTE FUNCTION public.alert_bad_review();

CREATE OR REPLACE FUNCTION public.ops_tick() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; n int := 0; k text;
BEGIN
  FOR o IN SELECT id, restaurant_id, order_number, created_at FROM orders
            WHERE status = 'received' AND accepted_at IS NULL AND created_at < now() - interval '5 minutes'
              AND (scheduled_for IS NULL OR scheduled_for < now() + interval '45 minutes') LOOP
    k := 'accept5:' || o.id;
    IF NOT EXISTS (SELECT 1 FROM ops_alert_log WHERE key = k) THEN
      INSERT INTO ops_alert_log(key) VALUES (k);
      n := n + public.push_users(public.staff_ids(o.restaurant_id, ARRAY['kitchen','restaurant_admin']::app_role[]),
        'Commande en attente !', 'La commande ' || o.order_number || ' attend depuis 5 min. Accepte-la.',
        jsonb_build_object('type', 'kitchen_alert', 'orderId', o.id));
    END IF;
    k := 'accept10:' || o.id;
    IF o.created_at < now() - interval '10 minutes' AND NOT EXISTS (SELECT 1 FROM ops_alert_log WHERE key = k) THEN
      INSERT INTO ops_alert_log(key) VALUES (k);
      n := n + public.push_users(public.staff_ids(o.restaurant_id, ARRAY['restaurant_admin','super_admin']::app_role[]),
        'Cuisine en retard', 'La commande ' || o.order_number || ' n''est toujours pas acceptée après 10 min.',
        jsonb_build_object('type', 'admin_alert', 'orderId', o.id));
    END IF;
  END LOOP;

  FOR o IN SELECT id, restaurant_id, order_number FROM orders
            WHERE status = 'ready' AND order_type = 'delivery' AND rider_id IS NULL
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

  IF NOT EXISTS (SELECT 1 FROM orders WHERE status IN ('received','in_kitchen','ready','on_the_way')
                   AND (scheduled_for IS NULL OR scheduled_for < now() + interval '1 hour'))
     AND NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.status = 'delivered' AND o2.customer_id IS NOT NULL
                       AND o2.delivered_at > now() - interval '35 minutes'
                       AND NOT EXISTS (SELECT 1 FROM ops_alert_log l WHERE l.key = 'review:' || o2.id)) THEN
    PERFORM cron.unschedule('bouff-ops-watch');
  END IF;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ops_tick: %', SQLERRM; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.ops_tick() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wake_ops_watch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bouff-ops-watch') THEN
    PERFORM cron.schedule('bouff-ops-watch', '* * * * *', 'SELECT public.ops_tick();');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'wake_ops_watch: %', SQLERRM; RETURN NEW;
END $$;
CREATE TRIGGER orders_wake_ops_watch AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.wake_ops_watch();

CREATE OR REPLACE FUNCTION public.daily_ops_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_local timestamp := now() AT TIME ZONE 'Africa/Porto-Novo'; v_h int; r record;
  v_orders int; v_total int; v_star text; v_out text; v_rating numeric; k text;
BEGIN
  v_h := extract(hour FROM v_local);
  IF v_h = 8 THEN
    UPDATE menu_items SET is_available = true, out_of_stock_at = NULL
     WHERE out_of_stock_at IS NOT NULL AND out_of_stock_at < date_trunc('day', v_local) AT TIME ZONE 'Africa/Porto-Novo';
    UPDATE item_variants SET is_available = true, out_of_stock_at = NULL
     WHERE out_of_stock_at IS NOT NULL AND out_of_stock_at < date_trunc('day', v_local) AT TIME ZONE 'Africa/Porto-Novo';
  END IF;
  FOR r IN SELECT id FROM restaurants
            WHERE is_active AND extract(hour FROM COALESCE(closes_at, '23:00'::time)) = v_h LOOP
    k := 'report:' || r.id || ':' || v_local::date;
    CONTINUE WHEN EXISTS (SELECT 1 FROM ops_alert_log WHERE key = k);
    INSERT INTO ops_alert_log(key) VALUES (k);
    SELECT count(*), COALESCE(sum(total_fcfa), 0) INTO v_orders, v_total FROM orders
     WHERE restaurant_id = r.id AND status <> 'cancelled' AND created_at > now() - interval '24 hours';
    SELECT oi.item_name INTO v_star FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.restaurant_id = r.id AND o.status <> 'cancelled' AND o.created_at > now() - interval '24 hours'
     GROUP BY oi.item_name ORDER BY sum(oi.quantity) DESC LIMIT 1;
    SELECT string_agg(name, ', ') INTO v_out FROM menu_items WHERE restaurant_id = r.id AND out_of_stock_at IS NOT NULL;
    SELECT round(avg(rating), 1) INTO v_rating FROM order_reviews WHERE restaurant_id = r.id AND created_at > now() - interval '24 hours';
    PERFORM public.push_users(public.staff_ids(r.id, ARRAY['restaurant_admin','super_admin']::app_role[]),
      'Bilan du jour BOUFF',
      v_orders || ' commandes, ' || v_total || ' F' || COALESCE('. Star : ' || v_star, '') ||
      COALESCE('. Ruptures : ' || v_out, '. Aucune rupture') || COALESCE('. Note : ' || v_rating || '/5', '') || '.',
      jsonb_build_object('type', 'daily_report'));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.daily_ops_tick() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.marketing_send(uuid, text, text, text, text, boolean);
CREATE FUNCTION public.marketing_send(p_user uuid, p_kind text, p_ref text, p_title text, p_body text, p_capped boolean DEFAULT true, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_local timestamp := now() AT TIME ZONE 'Africa/Porto-Novo'; v_h int; v_msgs jsonb;
BEGIN
  v_h := extract(hour FROM v_local);
  IF p_kind <> 'night' AND (v_h >= 22 OR v_h < 9) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE customer_id = p_user AND created_at > now() - interval '6 hours'
             AND status IN ('received','in_kitchen','ready','on_the_way')) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM marketing_push_log WHERE user_id = p_user AND kind = p_kind AND ref = p_ref) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM marketing_push_log WHERE user_id = p_user AND local_day = v_local::date) THEN RETURN false; END IF;
  IF p_capped AND (SELECT count(*) FROM marketing_push_log WHERE user_id = p_user AND capped AND sent_at > now() - interval '7 days') >= 2 THEN
    RETURN false;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('to', t.token, 'title', p_title, 'body', p_body, 'sound', 'default',
           'channelId', 'default', 'data', jsonb_build_object('type', 'marketing', 'kind', p_kind) || COALESCE(p_data, '{}'::jsonb)))
    INTO v_msgs FROM push_tokens t WHERE t.user_id = p_user AND t.offers;
  IF v_msgs IS NULL THEN RETURN false; END IF;
  INSERT INTO marketing_push_log(user_id, kind, ref, capped, local_day) VALUES (p_user, p_kind, p_ref, p_capped, v_local::date);
  BEGIN
    PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := v_msgs,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'push marketing non envoyé: %', SQLERRM;
  END;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.marketing_send(uuid, text, text, text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.marketing_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_local timestamp := now() AT TIME ZONE 'Africa/Porto-Novo'; v_today date; v_h int; v_dow int;
  v_week text; e record; u record; n int := 0; v_menu jsonb := '{"screen":"menu"}';
BEGIN
  v_today := v_local::date; v_h := extract(hour FROM v_local); v_dow := extract(isodow FROM v_local);
  v_week := to_char(v_local, 'IYYY-IW');

  FOR e IN SELECT es.id, es.starts_on, es.ends_on, c.country, c.flag, c.dish, r.escale_menu_item_id AS item
             FROM escales es JOIN escale_countries c ON c.id = es.country_id JOIN restaurants r ON r.id = es.restaurant_id
            WHERE es.status IN ('approved','live') AND es.ends_on >= v_today AND es.starts_on <= v_today + 1 LOOP
    FOR u IN SELECT DISTINCT user_id FROM push_tokens WHERE offers LOOP
      IF v_h = 18 AND e.starts_on = v_today + 1 THEN
        n := n + public.marketing_send(u.user_id, 'escale_teaser', e.id::text,
          'Escale BOUFF ' || e.flag, 'Demain, on part au ' || e.country || '. Prépare ton passeport.', false, v_menu)::int;
      ELSIF v_h = 11 AND e.starts_on = v_today THEN
        n := n + public.marketing_send(u.user_id, 'escale_live', e.id::text,
          'Escale BOUFF : ' || e.country || ' ' || e.flag, e.dish || ', c''est aujourd''hui. Seulement 2 jours !', false,
          jsonb_build_object('screen', 'product', 'productId', e.item))::int;
      ELSIF v_h = 17 AND e.ends_on = v_today AND e.starts_on < v_today THEN
        n := n + public.marketing_send(u.user_id, 'escale_last', e.id::text,
          'Dernier jour ! ' || e.flag, e.dish || ' quitte le menu ce soir. Mange d''abord.', false,
          jsonb_build_object('screen', 'product', 'productId', e.item))::int;
      END IF;
    END LOOP;
  END LOOP;

  IF v_dow = 5 AND v_h = 19 THEN
    FOR u IN SELECT DISTINCT user_id FROM push_tokens WHERE offers LOOP
      n := n + public.marketing_send(u.user_id, 'friday', v_week, 'BOUFF', 'Le week-end commence. Mange d''abord.', true, v_menu)::int;
    END LOOP;
  END IF;

  FOR u IN SELECT o.customer_id AS user_id FROM orders o
            WHERE o.customer_id IS NOT NULL AND o.status = 'delivered' AND o.created_at > now() - interval '60 days'
            GROUP BY o.customer_id
           HAVING count(*) >= 3
              AND mode() WITHIN GROUP (ORDER BY extract(hour FROM o.created_at AT TIME ZONE 'Africa/Porto-Novo')) = v_h + 1 LOOP
    n := n + public.marketing_send(u.user_id, 'habit', v_week, 'C''est bientôt l''heure', 'Ton BOUFF habituel ? Commande maintenant, on s''en occupe.', true, v_menu)::int;
  END LOOP;

  IF v_h = 12 THEN
    FOR u IN SELECT l.customer_id AS user_id, l.last_id, f.item_name AS fav, f.menu_item_id AS fav_id
               FROM (SELECT DISTINCT ON (customer_id) customer_id, id AS last_id, created_at
                       FROM orders WHERE customer_id IS NOT NULL AND status = 'delivered'
                      ORDER BY customer_id, created_at DESC) l
               LEFT JOIN LATERAL (SELECT oi.item_name, oi.menu_item_id FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id
                      WHERE o2.customer_id = l.customer_id AND o2.status = 'delivered'
                      GROUP BY oi.item_name, oi.menu_item_id ORDER BY sum(oi.quantity) DESC LIMIT 1) f ON true
              WHERE l.created_at BETWEEN now() - interval '14 days' AND now() - interval '10 days' LOOP
      n := n + public.marketing_send(u.user_id, 'winback', u.last_id::text, 'Ça fait longtemps…',
        COALESCE('Ton ' || u.fav || ' t''attend.', 'Ton combo t''attend.') || ' Mange d''abord.', true,
        CASE WHEN u.fav_id IS NOT NULL THEN jsonb_build_object('screen', 'product', 'productId', u.fav_id) ELSE v_menu END)::int;
    END LOOP;
  END IF;

  IF v_h = 1 AND v_dow IN (6, 7) THEN
    FOR u IN SELECT DISTINCT customer_id AS user_id FROM orders
              WHERE customer_id IS NOT NULL AND created_at > now() - interval '90 days'
                AND extract(hour FROM created_at AT TIME ZONE 'Africa/Porto-Novo') BETWEEN 0 AND 4 LOOP
      n := n + public.marketing_send(u.user_id, 'night', v_week, 'Faim à 2 h du mat ?', 'BOUFF livre. Mange d''abord.', true, v_menu)::int;
    END LOOP;
  END IF;

  FOR u IN SELECT ca.user_id, ca.first_item, ca.updated_at FROM cart_activity ca
            WHERE NOT ca.reminded AND ca.items > 0
              AND ca.updated_at BETWEEN now() - interval '3 hours' AND now() - interval '1 hour'
              AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = ca.user_id AND o.created_at > ca.updated_at) LOOP
    UPDATE cart_activity SET reminded = true WHERE user_id = u.user_id;
    n := n + public.marketing_send(u.user_id, 'cart', u.updated_at::text, 'Ton panier t''attend',
      COALESCE(u.first_item || ' est encore dans ton panier.', 'Ta commande est encore dans ton panier.') || ' On le prépare ?', true,
      '{"screen":"cart"}'::jsonb)::int;
  END LOOP;

  PERFORM public.daily_ops_tick();
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.marketing_tick() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_push_promo(p_variant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; u record; n int := 0;
BEGIN
  SELECT iv.id, iv.price_fcfa, iv.promo_price_fcfa, iv.promo_ends_at, m.id AS item_id, m.name, m.restaurant_id
    INTO v FROM item_variants iv JOIN menu_items m ON m.id = iv.menu_item_id WHERE iv.id = p_variant_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Formule introuvable.'; END IF;
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', v.restaurant_id) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  IF v.promo_price_fcfa IS NULL OR (v.promo_ends_at IS NOT NULL AND v.promo_ends_at < now()) THEN
    RAISE EXCEPTION 'Aucune promo active sur cette formule.';
  END IF;
  FOR u IN SELECT DISTINCT user_id FROM push_tokens WHERE offers LOOP
    n := n + public.marketing_send(u.user_id, 'promo', v.id::text || ':' || v.promo_price_fcfa, 'Promo BOUFF',
      v.name || ' à ' || v.promo_price_fcfa || ' F au lieu de ' || v.price_fcfa || ' F. Mange d''abord.', false,
      jsonb_build_object('screen', 'product', 'productId', v.item_id))::int;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_push_promo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_push_promo(uuid) TO authenticated;