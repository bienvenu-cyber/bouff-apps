
-- Caisse comptoir BOUFF : caissières avec code personnel, sessions tablette, commandes comptoir.

CREATE TABLE public.cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (btrim(full_name) <> ''),
  pin_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_cashiers_updated BEFORE UPDATE ON public.cashiers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cashier_sessions (
  token_hash text PRIMARY KEY,
  cashier_id uuid NOT NULL REFERENCES public.cashiers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE public.cashier_login_attempts (
  id bigserial PRIMARY KEY,
  cashier_id uuid REFERENCES public.cashiers(id) ON DELETE CASCADE,
  ok boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cashier_login_attempts_recent ON public.cashier_login_attempts (cashier_id, created_at);

ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_login_attempts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.cashiers, public.cashier_sessions, public.cashier_login_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cashier_login_attempts_id_seq TO service_role;
-- Aucun accès direct : tout passe par les fonctions ci-dessous.

ALTER TABLE public.orders
  ADD COLUMN source text NOT NULL DEFAULT 'online' CHECK (source IN ('online','counter')),
  ADD COLUMN dine_in boolean NOT NULL DEFAULT false,
  ADD COLUMN cashier_id uuid REFERENCES public.cashiers(id) ON DELETE SET NULL,
  ADD COLUMN paid_at timestamptz;

-- Les limites « commandes par numéro » ne s'appliquent pas à la caisse.
CREATE OR REPLACE FUNCTION public.guard_new_order()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  SELECT count(*) FILTER (WHERE status IN ('received','in_kitchen','ready','on_the_way')),
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

-- Pas de WhatsApp client quand la caisse n'a pas de numéro (numéro « 00000000 »).
CREATE OR REPLACE FUNCTION public.enqueue_order_notifications()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_event text;
  v_restaurant record;
  v_payload jsonb;
  v_has_phone boolean := regexp_replace(COALESCE(NEW.customer_phone,''), '\D', '', 'g') !~ '^0+$';
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'order_received';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := 'status_' || NEW.status::text;
  ELSE
    RETURN NEW;
  END IF;

  SELECT name, whatsapp_number, phone INTO v_restaurant
  FROM public.restaurants WHERE id = NEW.restaurant_id;

  v_payload := jsonb_build_object(
    'order_number', NEW.order_number,
    'status', NEW.status::text,
    'order_type', NEW.order_type::text,
    'total_fcfa', NEW.total_fcfa,
    'delivery_fee_fcfa', NEW.delivery_fee_fcfa,
    'customer_name', NEW.customer_name,
    'customer_phone', NEW.customer_phone,
    'delivery_address', NEW.delivery_address,
    'payment_method', NEW.payment_method::text,
    'restaurant_name', COALESCE(v_restaurant.name, 'BOUFF'),
    'cancel_reason', NEW.cancel_reason
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

  IF v_event IN ('order_received','status_cancelled') AND NEW.source <> 'counter' THEN
    INSERT INTO public.notification_outbox (order_id, restaurant_id, event, channel, audience, recipient, payload)
    VALUES (NEW.id, NEW.restaurant_id, v_event, 'whatsapp', 'restaurant',
            COALESCE(v_restaurant.whatsapp_number, v_restaurant.phone), v_payload);
  END IF;

  RETURN NEW;
END;
$function$;

-- ===== Admin : gestion des caissières =====
CREATE OR REPLACE FUNCTION public.admin_list_cashiers(p_restaurant_id uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r uuid := COALESCE(p_restaurant_id, public.bouff_restaurant_id());
BEGIN
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', r) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'full_name', c.full_name, 'is_active', c.is_active, 'created_at', c.created_at,
      'orders_today', (SELECT count(*) FROM public.orders o WHERE o.cashier_id = c.id
                        AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date = (now() AT TIME ZONE 'Africa/Porto-Novo')::date AND o.status <> 'cancelled'),
      'total_today', (SELECT COALESCE(sum(o.total_fcfa),0) FROM public.orders o WHERE o.cashier_id = c.id
                        AND (o.created_at AT TIME ZONE 'Africa/Porto-Novo')::date = (now() AT TIME ZONE 'Africa/Porto-Novo')::date AND o.status <> 'cancelled')
    ) ORDER BY c.is_active DESC, c.full_name)
    FROM public.cashiers c WHERE c.restaurant_id = r), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_cashier(p_id uuid, p_full_name text, p_pin text DEFAULT NULL, p_restaurant_id uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r uuid; v_id uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT restaurant_id INTO r FROM public.cashiers WHERE id = p_id;
    IF r IS NULL THEN RAISE EXCEPTION 'Caissière introuvable.'; END IF;
  ELSE
    r := COALESCE(p_restaurant_id, public.bouff_restaurant_id());
  END IF;
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', r) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN RAISE EXCEPTION 'Le prénom est obligatoire.'; END IF;
  IF p_pin IS NOT NULL AND p_pin !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'Le code doit faire exactement 6 chiffres.'; END IF;
  IF p_pin IS NOT NULL AND p_pin ~ '^(\d)\1{5}$' OR p_pin IN ('123456','654321','012345') THEN
    RAISE EXCEPTION 'Code trop facile à deviner, choisis-en un autre.';
  END IF;

  IF p_id IS NULL THEN
    IF p_pin IS NULL THEN RAISE EXCEPTION 'Le code est obligatoire.'; END IF;
    INSERT INTO public.cashiers(restaurant_id, full_name, pin_hash)
      VALUES (r, btrim(p_full_name), extensions.crypt(p_pin, extensions.gen_salt('bf')))
      RETURNING id INTO v_id;
  ELSE
    UPDATE public.cashiers SET full_name = btrim(p_full_name),
      pin_hash = CASE WHEN p_pin IS NULL THEN pin_hash ELSE extensions.crypt(p_pin, extensions.gen_salt('bf')) END
      WHERE id = p_id RETURNING id INTO v_id;
    IF p_pin IS NOT NULL THEN DELETE FROM public.cashier_sessions WHERE cashier_id = p_id; END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_cashier_active(p_id uuid, p_active boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r uuid;
BEGIN
  SELECT restaurant_id INTO r FROM public.cashiers WHERE id = p_id;
  IF r IS NULL THEN RAISE EXCEPTION 'Caissière introuvable.'; END IF;
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', r) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  UPDATE public.cashiers SET is_active = p_active WHERE id = p_id;
  IF NOT p_active THEN DELETE FROM public.cashier_sessions WHERE cashier_id = p_id; END IF;
END $$;

-- ===== Tablette comptoir =====
CREATE OR REPLACE FUNCTION public.counter_cashiers(p_slug text DEFAULT 'bouff')
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', split_part(c.full_name, ' ', 1)) ORDER BY c.full_name), '[]'::jsonb)
  FROM public.cashiers c JOIN public.restaurants r ON r.id = c.restaurant_id
  WHERE r.slug = p_slug AND c.is_active;
$$;

CREATE OR REPLACE FUNCTION private.counter_cashier(p_token text)
 RETURNS public.cashiers LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c public.cashiers;
BEGIN
  SELECT k.* INTO c FROM public.cashier_sessions s JOIN public.cashiers k ON k.id = s.cashier_id
   WHERE s.token_hash = encode(extensions.digest(COALESCE(p_token,''), 'sha256'), 'hex')
     AND s.expires_at > now() AND k.is_active;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Session caisse expirée. Entre ton code.' USING ERRCODE = 'P0001', HINT = 'counter_session'; END IF;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.counter_login(p_cashier_id uuid, p_pin text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c public.cashiers; v_fails int; v_token text; v_exp timestamptz := now() + interval '12 hours';
BEGIN
  SELECT * INTO c FROM public.cashiers WHERE id = p_cashier_id AND is_active;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Caissière introuvable.'; END IF;
  SELECT count(*) INTO v_fails FROM public.cashier_login_attempts
   WHERE cashier_id = c.id AND NOT ok AND created_at > now() - interval '15 minutes';
  IF v_fails >= 5 THEN RAISE EXCEPTION 'Trop d''essais. Réessaie dans 15 minutes.'; END IF;
  IF p_pin IS NULL OR extensions.crypt(p_pin, c.pin_hash) <> c.pin_hash THEN
    INSERT INTO public.cashier_login_attempts(cashier_id, ok) VALUES (c.id, false);
    RETURN jsonb_build_object('ok', false, 'remaining', GREATEST(4 - v_fails, 0));
  END IF;
  INSERT INTO public.cashier_login_attempts(cashier_id, ok) VALUES (c.id, true);
  DELETE FROM public.cashier_sessions WHERE expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.cashier_sessions(token_hash, cashier_id, expires_at)
    VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), c.id, v_exp);
  RETURN jsonb_build_object('ok', true, 'token', v_token, 'name', c.full_name, 'expires_at', v_exp);
END $$;

CREATE OR REPLACE FUNCTION public.counter_session(p_token text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c public.cashiers;
BEGIN
  c := private.counter_cashier(p_token);
  RETURN jsonb_build_object('name', c.full_name, 'restaurant_id', c.restaurant_id);
END $$;

CREATE OR REPLACE FUNCTION public.counter_logout(p_token text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  DELETE FROM public.cashier_sessions WHERE token_hash = encode(extensions.digest(COALESCE(p_token,''), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.counter_place_order(
  p_token text, p_items jsonb, p_dine_in boolean, p_payment_method payment_method,
  p_customer_name text DEFAULT NULL, p_customer_phone text DEFAULT NULL, p_note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c public.cashiers; v jsonb; v_phone text; v_digits text; v_customer uuid; v_note text;
BEGIN
  c := private.counter_cashier(p_token);
  IF p_payment_method NOT IN ('cash','mobile_money') THEN RAISE EXCEPTION 'Paiement : espèces ou MoMo uniquement.'; END IF;
  v_digits := regexp_replace(COALESCE(p_customer_phone,''), '\D', '', 'g');
  IF v_digits <> '' AND length(v_digits) < 8 THEN RAISE EXCEPTION 'Numéro du client invalide.'; END IF;
  v_phone := CASE WHEN v_digits = '' THEN '00000000' ELSE btrim(p_customer_phone) END;
  v_note := CASE WHEN p_dine_in THEN 'SUR PLACE' ELSE 'À EMPORTER' END || ' · Comptoir'
            || COALESCE(' · ' || NULLIF(btrim(COALESCE(p_note,'')), ''), '');

  PERFORM set_config('bouff.counter', '1', true);
  v := public.place_order_base(c.restaurant_id, COALESCE(NULLIF(btrim(COALESCE(p_customer_name,'')), ''), 'Client comptoir'),
         v_phone, 'takeaway', p_items, NULL, NULL, p_payment_method, v_note, NULL);
  PERFORM set_config('bouff.counter', '', true);

  IF v_digits <> '' THEN
    SELECT p.id INTO v_customer FROM public.profiles p
     WHERE right(regexp_replace(COALESCE(p.phone,''), '\D', '', 'g'), 8) = right(v_digits, 8)
     ORDER BY p.created_at LIMIT 1;
  END IF;

  UPDATE public.orders SET source = 'counter', dine_in = COALESCE(p_dine_in,false), cashier_id = c.id,
         paid_at = now(), customer_id = COALESCE(customer_id, v_customer)
   WHERE id = (v->>'order_id')::uuid;

  RETURN v || jsonb_build_object('cashier', c.full_name, 'dine_in', COALESCE(p_dine_in,false),
                                 'points_linked', v_customer IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.counter_recent_orders(p_token text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c public.cashiers;
BEGIN
  c := private.counter_cashier(p_token);
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('order_number', o.order_number, 'status', o.status,
            'total_fcfa', o.total_fcfa, 'customer_name', o.customer_name, 'dine_in', o.dine_in,
            'payment_method', o.payment_method, 'created_at', o.created_at) ORDER BY o.created_at DESC)
    FROM (SELECT * FROM public.orders WHERE restaurant_id = c.restaurant_id AND source = 'counter'
            AND created_at > now() - interval '12 hours' ORDER BY created_at DESC LIMIT 30) o), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.admin_list_cashiers(uuid), public.admin_save_cashier(uuid,text,text,uuid),
  public.admin_set_cashier_active(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_cashiers(uuid), public.admin_save_cashier(uuid,text,text,uuid),
  public.admin_set_cashier_active(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION private.counter_cashier(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.counter_cashiers(text), public.counter_login(uuid,text), public.counter_session(text),
  public.counter_logout(text), public.counter_place_order(text,jsonb,boolean,payment_method,text,text,text),
  public.counter_recent_orders(text) TO anon, authenticated;
