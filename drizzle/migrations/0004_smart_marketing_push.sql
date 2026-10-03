CREATE TABLE public.marketing_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  ref text NOT NULL,
  capped boolean NOT NULL DEFAULT true,
  local_day date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX marketing_push_log_once ON public.marketing_push_log (user_id, kind, ref);
CREATE INDEX marketing_push_log_user ON public.marketing_push_log (user_id, sent_at DESC);
GRANT ALL ON public.marketing_push_log TO service_role;
ALTER TABLE public.marketing_push_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cart_activity (
  user_id uuid PRIMARY KEY,
  items integer NOT NULL DEFAULT 0,
  first_item text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  reminded boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.cart_activity TO service_role;
ALTER TABLE public.cart_activity ENABLE ROW LEVEL SECURITY;

-- Le client signale l'état de son panier (pour le rappel unique de panier abandonné).
CREATE OR REPLACE FUNCTION public.touch_cart(p_items integer, p_first_item text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO cart_activity(user_id, items, first_item, updated_at, reminded)
  VALUES (auth.uid(), GREATEST(COALESCE(p_items,0),0), left(p_first_item, 80), now(), false)
  ON CONFLICT (user_id) DO UPDATE SET items = EXCLUDED.items, first_item = EXCLUDED.first_item,
    updated_at = now(), reminded = false;
END $$;
REVOKE ALL ON FUNCTION public.touch_cart(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_cart(integer, text) TO authenticated;

-- Envoi d'une notification marketing avec toutes les règles de garde.
CREATE OR REPLACE FUNCTION public.marketing_send(p_user uuid, p_kind text, p_ref text, p_title text, p_body text, p_capped boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_local timestamp := now() AT TIME ZONE 'Africa/Porto-Novo'; v_h int; v_msgs jsonb;
BEGIN
  v_h := extract(hour FROM v_local);
  -- heures calmes 22 h - 9 h, sauf message de nuit
  IF p_kind <> 'night' AND (v_h >= 22 OR v_h < 9) THEN RETURN false; END IF;
  -- pas de pub pendant une commande en cours
  IF EXISTS (SELECT 1 FROM orders WHERE customer_id = p_user AND created_at > now() - interval '6 hours'
             AND status IN ('received','in_kitchen','ready','on_the_way')) THEN RETURN false; END IF;
  -- jamais deux fois le même message
  IF EXISTS (SELECT 1 FROM marketing_push_log WHERE user_id = p_user AND kind = p_kind AND ref = p_ref) THEN RETURN false; END IF;
  -- un seul message marketing par jour
  IF EXISTS (SELECT 1 FROM marketing_push_log WHERE user_id = p_user AND local_day = v_local::date) THEN RETURN false; END IF;
  -- au plus 2 messages automatiques par semaine
  IF p_capped AND (SELECT count(*) FROM marketing_push_log WHERE user_id = p_user AND capped AND sent_at > now() - interval '7 days') >= 2 THEN
    RETURN false;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('to', t.token, 'title', p_title, 'body', p_body, 'sound', 'default',
           'channelId', 'default', 'data', jsonb_build_object('type', 'marketing', 'kind', p_kind)))
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
REVOKE ALL ON FUNCTION public.marketing_send(uuid, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

-- Passage horaire : décide qui reçoit quoi.
CREATE OR REPLACE FUNCTION public.marketing_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_local timestamp := now() AT TIME ZONE 'Africa/Porto-Novo'; v_today date; v_h int; v_dow int;
  v_week text; e record; u record; n int := 0;
BEGIN
  v_today := v_local::date; v_h := extract(hour FROM v_local); v_dow := extract(isodow FROM v_local);
  v_week := to_char(v_local, 'IYYY-IW');

  -- Escale BOUFF : teaser la veille 18 h, annonce jour J 11 h, dernier jour 17 h
  FOR e IN SELECT es.id, es.starts_on, es.ends_on, c.country, c.flag, c.dish
             FROM escales es JOIN escale_countries c ON c.id = es.country_id
            WHERE es.status IN ('approved','live') AND es.ends_on >= v_today AND es.starts_on <= v_today + 1 LOOP
    FOR u IN SELECT DISTINCT user_id FROM push_tokens WHERE offers LOOP
      IF v_h = 18 AND e.starts_on = v_today + 1 THEN
        n := n + public.marketing_send(u.user_id, 'escale_teaser', e.id::text,
          'Escale BOUFF ' || e.flag, 'Demain, on part au ' || e.country || '. Prépare ton passeport.', false)::int;
      ELSIF v_h = 11 AND e.starts_on = v_today THEN
        n := n + public.marketing_send(u.user_id, 'escale_live', e.id::text,
          'Escale BOUFF : ' || e.country || ' ' || e.flag, e.dish || ', c''est aujourd''hui. Seulement 2 jours !', false)::int;
      ELSIF v_h = 17 AND e.ends_on = v_today AND e.starts_on < v_today THEN
        n := n + public.marketing_send(u.user_id, 'escale_last', e.id::text,
          'Dernier jour ! ' || e.flag, e.dish || ' quitte le menu ce soir. Mange d''abord.', false)::int;
      END IF;
    END LOOP;
  END LOOP;

  -- Vendredi 19 h
  IF v_dow = 5 AND v_h = 19 THEN
    FOR u IN SELECT DISTINCT user_id FROM push_tokens WHERE offers LOOP
      n := n + public.marketing_send(u.user_id, 'friday', v_week, 'BOUFF', 'Le week-end commence. Mange d''abord.', true)::int;
    END LOOP;
  END IF;

  -- Heure habituelle : 1 h avant l'heure où le client commande le plus (3 commandes minimum sur 60 jours)
  FOR u IN SELECT o.customer_id AS user_id
             FROM orders o
            WHERE o.customer_id IS NOT NULL AND o.status = 'delivered' AND o.created_at > now() - interval '60 days'
            GROUP BY o.customer_id
           HAVING count(*) >= 3
              AND mode() WITHIN GROUP (ORDER BY extract(hour FROM o.created_at AT TIME ZONE 'Africa/Porto-Novo')) = v_h + 1 LOOP
    n := n + public.marketing_send(u.user_id, 'habit', v_week, 'C''est bientôt l''heure', 'Ton BOUFF habituel ? Commande maintenant, on s''en occupe.', true)::int;
  END LOOP;

  -- Client absent depuis 10 à 14 jours, à 12 h, avec son plat préféré
  IF v_h = 12 THEN
    FOR u IN SELECT l.customer_id AS user_id, l.last_id,
                    (SELECT oi.item_name FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id
                      WHERE o2.customer_id = l.customer_id AND o2.status = 'delivered'
                      GROUP BY oi.item_name ORDER BY sum(oi.quantity) DESC LIMIT 1) AS fav
               FROM (SELECT DISTINCT ON (customer_id) customer_id, id AS last_id, created_at
                       FROM orders WHERE customer_id IS NOT NULL AND status = 'delivered'
                      ORDER BY customer_id, created_at DESC) l
              WHERE l.created_at BETWEEN now() - interval '14 days' AND now() - interval '10 days' LOOP
      n := n + public.marketing_send(u.user_id, 'winback', u.last_id::text, 'Ça fait longtemps…',
        COALESCE('Ton ' || u.fav || ' t''attend.', 'Ton combo t''attend.') || ' Mange d''abord.', true)::int;
    END LOOP;
  END IF;

  -- Nuit (vendredi et samedi soir, 1 h) : seulement les clients qui ont déjà commandé la nuit
  IF v_h = 1 AND v_dow IN (6, 7) THEN
    FOR u IN SELECT DISTINCT customer_id AS user_id FROM orders
              WHERE customer_id IS NOT NULL AND created_at > now() - interval '90 days'
                AND extract(hour FROM created_at AT TIME ZONE 'Africa/Porto-Novo') BETWEEN 0 AND 4 LOOP
      n := n + public.marketing_send(u.user_id, 'night', v_week, 'Faim à 2 h du mat ?', 'BOUFF livre. Mange d''abord.', true)::int;
    END LOOP;
  END IF;

  -- Panier abandonné : un seul rappel, environ 1 h après
  FOR u IN SELECT ca.user_id, ca.first_item, ca.updated_at FROM cart_activity ca
            WHERE NOT ca.reminded AND ca.items > 0
              AND ca.updated_at BETWEEN now() - interval '3 hours' AND now() - interval '1 hour'
              AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = ca.user_id AND o.created_at > ca.updated_at) LOOP
    UPDATE cart_activity SET reminded = true WHERE user_id = u.user_id;
    n := n + public.marketing_send(u.user_id, 'cart', u.updated_at::text, 'Ton panier t''attend',
      COALESCE(u.first_item || ' est encore dans ton panier.', 'Ta commande est encore dans ton panier.') || ' On le prépare ?', true)::int;
  END LOOP;

  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.marketing_tick() FROM PUBLIC, anon, authenticated;

-- Promo de l'admin : envoi en un clic (une fois par prix promo)
CREATE OR REPLACE FUNCTION public.admin_push_promo(p_variant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; u record; n int := 0;
BEGIN
  SELECT iv.id, iv.name AS vname, iv.price_fcfa, iv.promo_price_fcfa, iv.promo_ends_at, m.name, m.restaurant_id
    INTO v FROM item_variants iv JOIN menu_items m ON m.id = iv.menu_item_id WHERE iv.id = p_variant_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Formule introuvable.'; END IF;
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', v.restaurant_id) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  IF v.promo_price_fcfa IS NULL OR (v.promo_ends_at IS NOT NULL AND v.promo_ends_at < now()) THEN
    RAISE EXCEPTION 'Aucune promo active sur cette formule.';
  END IF;
  FOR u IN SELECT DISTINCT user_id FROM push_tokens WHERE offers LOOP
    n := n + public.marketing_send(u.user_id, 'promo', v.id::text || ':' || v.promo_price_fcfa, 'Promo BOUFF',
      v.name || ' à ' || v.promo_price_fcfa || ' F au lieu de ' || v.price_fcfa || ' F. Mange d''abord.', false)::int;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_push_promo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_push_promo(uuid) TO authenticated;