CREATE OR REPLACE FUNCTION public.push_kitchen_new_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_msgs jsonb; v_users uuid[];
BEGIN
  IF NEW.status <> 'received' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'received' THEN RETURN NEW; END IF;
  v_users := public.staff_ids(NEW.restaurant_id, ARRAY['kitchen','restaurant_admin']::app_role[]);
  SELECT jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', 'Nouvelle commande ' || COALESCE(NEW.order_number, ''),
           'body', CASE WHEN NEW.source = 'counter' THEN 'Comptoir' ELSE COALESCE(NEW.customer_name, 'Client') END
                   || ' · ' || NEW.total_fcfa || ' F. Ouvre l''app pour l''accepter.',
           'sound', 'beep3.mp3', 'priority', 'high', 'ttl', 600,
           'channelId', 'orders',
           'data', jsonb_build_object('type', 'new_order', 'orderId', NEW.id)))
    INTO v_msgs FROM push_tokens t
   WHERE t.user_id = ANY(v_users) AND t.platform = 'kitchen';
  IF v_msgs IS NOT NULL THEN
    PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := v_msgs,
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'push_kitchen_new_order: %', SQLERRM; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.push_kitchen_new_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_push_kitchen_new ON public.orders;
CREATE TRIGGER orders_push_kitchen_new AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.push_kitchen_new_order();