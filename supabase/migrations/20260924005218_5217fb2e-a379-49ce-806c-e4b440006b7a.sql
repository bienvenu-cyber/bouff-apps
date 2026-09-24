-- Index
CREATE INDEX IF NOT EXISTS orders_number_upper_idx ON public.orders (upper(order_number));
CREATE INDEX IF NOT EXISTS orders_phone_created_idx ON public.orders (regexp_replace(customer_phone, '\D', '', 'g'), created_at DESC);
CREATE INDEX IF NOT EXISTS orders_restaurant_status_idx ON public.orders (restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON public.orders (customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_order_idx ON public.notifications (order_id);
CREATE INDEX IF NOT EXISTS order_items_menu_idx ON public.order_items (menu_item_id);
CREATE INDEX IF NOT EXISTS order_items_variant_idx ON public.order_items (variant_id);
CREATE INDEX IF NOT EXISTS order_item_options_option_idx ON public.order_item_options (option_id);
CREATE INDEX IF NOT EXISTS orders_zone_idx ON public.orders (delivery_zone_id);
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles (user_id);

-- Réglages restaurant
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_temporarily_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_order_fcfa integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_active_orders_per_phone integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_orders_per_phone_hour integer NOT NULL DEFAULT 5;

UPDATE public.restaurants SET opens_at = '11:00', closes_at = '02:00', min_order_fcfa = 500 WHERE slug = 'bouff';

CREATE OR REPLACE FUNCTION public.is_restaurant_open(p_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.is_active AND NOT r.is_temporarily_closed AND (
    r.opens_at IS NULL OR r.closes_at IS NULL OR
    CASE WHEN r.opens_at <= r.closes_at
      THEN (now() AT TIME ZONE 'Africa/Porto-Novo')::time >= r.opens_at AND (now() AT TIME ZONE 'Africa/Porto-Novo')::time < r.closes_at
      ELSE (now() AT TIME ZONE 'Africa/Porto-Novo')::time >= r.opens_at OR (now() AT TIME ZONE 'Africa/Porto-Novo')::time < r.closes_at
    END)
  FROM public.restaurants r WHERE r.id = p_restaurant_id
$$;
GRANT EXECUTE ON FUNCTION public.is_restaurant_open(uuid) TO anon, authenticated;

-- Fermeture d'urgence (admin du resto ou admin général)
CREATE OR REPLACE FUNCTION public.set_restaurant_closed(p_restaurant_id uuid, p_closed boolean)
RETURNS public.restaurants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.restaurants;
BEGIN
  IF NOT (private.is_super_admin(auth.uid()) OR private.has_restaurant_role(auth.uid(), 'restaurant_admin', p_restaurant_id)) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  UPDATE public.restaurants SET is_temporarily_closed = p_closed WHERE id = p_restaurant_id RETURNING * INTO v;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_restaurant_closed(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_restaurant_closed(uuid, boolean) TO authenticated;

-- Contrôles avant commande (appelé au début de place_order)
CREATE OR REPLACE FUNCTION public.guard_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.restaurants; v_phone text; v_active int; v_hour int;
BEGIN
  SELECT * INTO r FROM public.restaurants WHERE id = NEW.restaurant_id;
  IF r.is_temporarily_closed THEN
    RAISE EXCEPTION 'Le restaurant est fermé pour le moment. Réessayez plus tard.';
  END IF;
  IF NOT public.is_restaurant_open(NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Le restaurant est fermé. Ouvert de % à %.', to_char(r.opens_at, 'HH24"h"MI'), to_char(r.closes_at, 'HH24"h"MI');
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
END $$;
DROP TRIGGER IF EXISTS orders_guard_new ON public.orders;
CREATE TRIGGER orders_guard_new BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_new_order();

-- Montant minimum (vérifié quand le total est calculé)
CREATE OR REPLACE FUNCTION public.guard_min_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_min int;
BEGIN
  IF NEW.status = 'received' AND OLD.items_total_fcfa = 0 AND NEW.items_total_fcfa > 0 THEN
    SELECT min_order_fcfa INTO v_min FROM public.restaurants WHERE id = NEW.restaurant_id;
    IF NEW.items_total_fcfa < v_min THEN
      RAISE EXCEPTION 'Commande minimum : % F (hors livraison).', v_min;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_guard_min ON public.orders;
CREATE TRIGGER orders_guard_min BEFORE UPDATE OF items_total_fcfa ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_min_order();

-- Annulation par le client tant que la cuisine n'a pas accepté
CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_number text, p_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.orders;
BEGIN
  SELECT * INTO v FROM public.orders WHERE upper(order_number) = upper(btrim(p_order_number)) FOR UPDATE;
  IF v.id IS NULL OR NOT (
    (auth.uid() IS NOT NULL AND v.customer_id = auth.uid()) OR
    (p_phone IS NOT NULL AND regexp_replace(v.customer_phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g'))
  ) THEN
    RAISE EXCEPTION 'Commande introuvable.';
  END IF;
  IF v.status <> 'received' THEN
    RAISE EXCEPTION 'La cuisine a déjà accepté cette commande, elle ne peut plus être annulée.';
  END IF;
  UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Annulée par le client'
   WHERE id = v.id;
  RETURN jsonb_build_object('order_number', v.order_number, 'status', 'cancelled');
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_my_order(text, text) TO anon, authenticated;

-- Suivi en direct pour les clients sans compte : diffusion du statut sur un canal propre à la commande
CREATE OR REPLACE FUNCTION public.broadcast_order_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM realtime.send(
      jsonb_build_object('order_number', NEW.order_number, 'status', NEW.status, 'order_type', NEW.order_type),
      'status', 'order:' || NEW.id::text, false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_broadcast_status ON public.orders;
CREATE TRIGGER orders_broadcast_status AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.broadcast_order_status();

REVOKE EXECUTE ON FUNCTION public.guard_new_order(), public.guard_min_order(), public.broadcast_order_status() FROM anon, authenticated, public;