ALTER TABLE public.marketing_push_log ADD COLUMN IF NOT EXISTS opened_at timestamptz;

CREATE OR REPLACE FUNCTION public.marketing_send(p_user uuid, p_kind text, p_ref text, p_title text, p_body text, p_capped boolean DEFAULT true, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_local timestamp := now() AT TIME ZONE 'Africa/Porto-Novo'; v_h int; v_msgs jsonb; v_log uuid;
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
  IF NOT EXISTS (SELECT 1 FROM push_tokens t WHERE t.user_id = p_user AND t.offers) THEN RETURN false; END IF;
  INSERT INTO marketing_push_log(user_id, kind, ref, capped, local_day) VALUES (p_user, p_kind, p_ref, p_capped, v_local::date)
    RETURNING id INTO v_log;
  SELECT jsonb_agg(jsonb_build_object('to', t.token, 'title', p_title, 'body', p_body, 'sound', 'default',
           'channelId', 'default', 'data', jsonb_build_object('type', 'marketing', 'kind', p_kind, 'logId', v_log) || COALESCE(p_data, '{}'::jsonb)))
    INTO v_msgs FROM push_tokens t WHERE t.user_id = p_user AND t.offers;
  BEGIN
    PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := v_msgs,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'push marketing non envoyé: %', SQLERRM;
  END;
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.track_push_open(p_log uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE marketing_push_log SET opened_at = now()
   WHERE id = p_log AND user_id = auth.uid() AND opened_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.track_push_open(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.track_push_open(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_push_stats(p_days integer DEFAULT 30)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('restaurant_admin','super_admin')) THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  WITH l AS (
    SELECT m.*, EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = m.user_id AND o.status <> 'cancelled'
                         AND o.created_at BETWEEN m.sent_at AND m.sent_at + interval '24 hours') AS converted
      FROM marketing_push_log m WHERE m.sent_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'sent', sent, 'opened', opened, 'ordered', ordered) ORDER BY sent DESC), '[]'::jsonb)
    INTO v FROM (SELECT kind, count(*) sent, count(opened_at) opened, count(*) FILTER (WHERE converted) ordered FROM l GROUP BY kind) s;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_push_stats(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_push_stats(integer) TO authenticated;

CREATE TABLE public.passport_stamps (
  user_id uuid NOT NULL,
  country_id uuid NOT NULL REFERENCES public.escale_countries(id) ON DELETE CASCADE,
  escale_id uuid REFERENCES public.escales(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, country_id)
);
GRANT SELECT ON public.passport_stamps TO authenticated;
GRANT ALL ON public.passport_stamps TO service_role;
ALTER TABLE public.passport_stamps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mes tampons" ON public.passport_stamps FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.stamp_passport()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_item uuid; v_esc record; v_n int;
BEGIN
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' OR NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  SELECT escale_menu_item_id INTO v_item FROM restaurants WHERE id = NEW.restaurant_id;
  IF v_item IS NULL OR NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = NEW.id AND menu_item_id = v_item) THEN RETURN NEW; END IF;
  SELECT e.id, e.country_id INTO v_esc FROM escales e
   WHERE e.restaurant_id = NEW.restaurant_id AND e.status IN ('live','done')
     AND (NEW.created_at AT TIME ZONE 'Africa/Porto-Novo')::date BETWEEN e.starts_on AND e.ends_on
   ORDER BY e.starts_on DESC LIMIT 1;
  IF v_esc.id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO passport_stamps(user_id, country_id, escale_id, order_id)
    VALUES (NEW.customer_id, v_esc.country_id, v_esc.id, NEW.id) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_n FROM passport_stamps WHERE user_id = NEW.customer_id;
  IF v_n % 5 = 0 THEN
    INSERT INTO reward_ledger(user_id, restaurant_id, kind, amount, reason, order_id, note)
      VALUES (NEW.customer_id, NEW.restaurant_id, 'wallet', 2500, 'milestone', NEW.id,
              'BOUFF Passport : ' || v_n || ' pays goûtés, un combo offert');
    INSERT INTO notifications(user_id, order_id, title, body)
      VALUES (NEW.customer_id, NEW.id, 'Passport complété !', v_n || ' pays goûtés : 2 500 F ajoutés à ton portefeuille. Un combo offert !');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_passport_stamp AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_passport();

CREATE OR REPLACE FUNCTION public.my_passport()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object('goal', 5, 'reward_fcfa', 2500,
    'stamps', COALESCE((SELECT jsonb_agg(jsonb_build_object('country', c.country, 'flag', c.flag, 'dish', c.dish, 'at', s.created_at) ORDER BY s.created_at)
      FROM passport_stamps s JOIN escale_countries c ON c.id = s.country_id WHERE s.user_id = auth.uid()), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.my_passport() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_passport() TO authenticated;

CREATE TABLE public.customer_birthdays (
  user_id uuid PRIMARY KEY,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_birthdays TO service_role;
ALTER TABLE public.customer_birthdays ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.birthday_gifts (
  user_id uuid NOT NULL,
  year int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year)
);
GRANT ALL ON public.birthday_gifts TO service_role;
ALTER TABLE public.birthday_gifts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_my_birthday(p_month integer, p_day integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  IF p_month NOT BETWEEN 1 AND 12 OR p_day < 1
     OR p_day > extract(day FROM (make_date(2000, p_month, 1) + interval '1 month - 1 day')) THEN
    RAISE EXCEPTION 'Date invalide.';
  END IF;
  IF EXISTS (SELECT 1 FROM customer_birthdays WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ta date est déjà enregistrée. Pour la corriger, contacte BOUFF.';
  END IF;
  INSERT INTO customer_birthdays(user_id, month, day) VALUES (auth.uid(), p_month, p_day);
  RETURN jsonb_build_object('month', p_month, 'day', p_day);
END $$;
REVOKE ALL ON FUNCTION public.set_my_birthday(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_birthday(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_birthday()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT to_jsonb(b) - 'user_id' FROM customer_birthdays b WHERE user_id = auth.uid(); $$;
REVOKE ALL ON FUNCTION public.my_birthday() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_birthday() TO authenticated;

CREATE OR REPLACE FUNCTION public.birthday_tick()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Africa/Porto-Novo')::date; r record; n int := 0;
  v_resto uuid := public.bouff_restaurant_id(); v_leap boolean;
BEGIN
  v_leap := extract(day FROM make_date(extract(year FROM v_today)::int, 3, 1) - 1) = 29;
  FOR r IN SELECT b.user_id FROM customer_birthdays b
    WHERE ((b.month = extract(month FROM v_today) AND b.day = extract(day FROM v_today))
        OR (NOT v_leap AND b.month = 2 AND b.day = 29 AND extract(month FROM v_today) = 2 AND extract(day FROM v_today) = 28))
      AND b.created_at < now() - interval '30 days'
      AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = b.user_id AND o.status = 'delivered')
  LOOP
    INSERT INTO birthday_gifts(user_id, year) VALUES (r.user_id, extract(year FROM v_today)::int) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;
    INSERT INTO reward_ledger(user_id, restaurant_id, kind, amount, reason, note)
      VALUES (r.user_id, v_resto, 'free_delivery', 1, 'milestone', 'Cadeau d''anniversaire ' || extract(year FROM v_today));
    PERFORM public.marketing_send(r.user_id, 'birthday', extract(year FROM v_today)::text,
      'Joyeux anniversaire ! 🎂', 'BOUFF t''offre ta livraison aujourd''hui. Mange d''abord, fête ensuite.', false, '{}'::jsonb);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.birthday_tick() FROM public, anon, authenticated;

SELECT cron.schedule('bouff-birthday-daily', '0 9 * * *', 'SELECT public.birthday_tick()');