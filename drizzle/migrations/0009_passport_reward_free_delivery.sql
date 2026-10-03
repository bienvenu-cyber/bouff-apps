CREATE OR REPLACE FUNCTION public.stamp_passport()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      VALUES (NEW.customer_id, NEW.restaurant_id, 'free_delivery', 1, 'milestone', NEW.id,
              'BOUFF Passport : ' || v_n || ' pays goûtés, une livraison offerte');
    INSERT INTO notifications(user_id, order_id, title, body)
      VALUES (NEW.customer_id, NEW.id, 'Passport complété !', v_n || ' pays goûtés : ta prochaine livraison est offerte !');
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.my_passport()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object('goal', 5, 'reward', 'free_delivery',
    'stamps', COALESCE((SELECT jsonb_agg(jsonb_build_object('country', c.country, 'flag', c.flag, 'dish', c.dish, 'at', s.created_at) ORDER BY s.created_at)
      FROM passport_stamps s JOIN escale_countries c ON c.id = s.country_id WHERE s.user_id = auth.uid()), '[]'::jsonb));
$$;