-- lovable-cron-fallback-reviewed: Reuse existing wake-on-order minute job and stop after drain; no second permanent poller, 5/30 minute precision required.
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'internal' CHECK (delivery_mode IN ('internal','external'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'internal' CHECK (delivery_mode IN ('internal','external'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS auto_closed_at timestamptz;
COMMENT ON COLUMN public.orders.auto_closed_at IS 'Estimated external-courier closure, not proof of delivery; delivered_at remains null.';
CREATE INDEX IF NOT EXISTS orders_external_pending ON public.orders(status,ready_at,picked_up_at) WHERE delivery_mode='external' AND status IN ('ready','on_the_way');
CREATE OR REPLACE FUNCTION public.guard_delivery_mode() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='INSERT' THEN IF NEW.order_type='delivery' THEN SELECT r.delivery_mode INTO NEW.delivery_mode FROM public.restaurants r WHERE r.id=NEW.restaurant_id; END IF;
 ELSE IF NEW.delivery_mode IS DISTINCT FROM OLD.delivery_mode AND NEW.rider_id IS NOT NULL THEN RAISE EXCEPTION 'Une course attribuée doit rester suivie par son livreur.'; END IF; END IF;
 IF NEW.delivery_mode='external' AND NEW.rider_id IS NOT NULL THEN RAISE EXCEPTION 'Les courses externes ne sont pas disponibles dans l’application livreur.'; END IF;
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.guard_delivery_mode() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER orders_delivery_mode BEFORE INSERT OR UPDATE OF rider_id,delivery_mode ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_mode();
CREATE OR REPLACE FUNCTION public.external_delivery_tick() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n integer; m integer; BEGIN
 WITH changed AS (UPDATE public.orders SET status='on_the_way',picked_up_at=now() WHERE delivery_mode='external' AND order_type='delivery' AND rider_id IS NULL AND status='ready' AND ready_at<=now()-interval '5 minutes' RETURNING id) SELECT count(*) INTO n FROM changed;
 WITH changed AS (UPDATE public.orders SET status='delivered',auto_closed_at=now(),delivered_at=NULL WHERE delivery_mode='external' AND order_type='delivery' AND rider_id IS NULL AND status='on_the_way' AND picked_up_at<=now()-interval '30 minutes' RETURNING id) SELECT count(*) INTO m FROM changed;
 RETURN n+m; END $$;
REVOKE ALL ON FUNCTION public.external_delivery_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.external_delivery_tick() TO service_role;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.ops_tick()'::regprocedure) INTO d;
 d:=replace(d,'BEGIN'||chr(10)||'  FOR o IN','BEGIN'||chr(10)||'  PERFORM public.external_delivery_tick();'||chr(10)||'  FOR o IN');
 d:=replace(d,'AND rider_id IS NULL',$s$AND rider_id IS NULL AND delivery_mode='internal'$s$); EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION public.wake_delivery_watch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.delivery_mode='external' AND NEW.status IN ('ready','on_the_way') AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='bouff-ops-watch') THEN PERFORM cron.schedule('bouff-ops-watch','* * * * *','SELECT public.ops_tick();'); END IF;
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.wake_delivery_watch() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER orders_wake_external AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.wake_delivery_watch();
ALTER POLICY orders_select ON public.orders USING (customer_id=auth.uid() OR private.manages_restaurant(auth.uid(),restaurant_id) OR rider_id=private.current_rider_id() OR (delivery_mode='internal' AND rider_id IS NULL AND order_type='delivery' AND status IN ('ready','in_kitchen') AND restaurant_id=private.current_rider_restaurant()));
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.claim_order(uuid)'::regprocedure) INTO d;
 d:=replace(d,'IF v_order.rider_id IS NOT NULL THEN',$s$IF v_order.delivery_mode='external' OR EXISTS (SELECT 1 FROM public.restaurants WHERE id=v_order.restaurant_id AND delivery_mode='external') THEN RAISE EXCEPTION 'Le restaurant utilise des coursiers externes.'; END IF;$s$||chr(10)||'  IF v_order.rider_id IS NOT NULL THEN'); EXECUTE d;
 SELECT pg_get_functiondef('public.notify_customer_in_app()'::regprocedure) INTO d;
 d:=replace(d,'INSERT INTO public.notifications(user_id',$s$IF NEW.delivery_mode='external' THEN v_body := CASE NEW.status WHEN 'ready' THEN 'Votre commande est prête. Départ estimé dans 5 minutes.' WHEN 'on_the_way' THEN 'Votre commande est en livraison (suivi estimé).' WHEN 'delivered' THEN 'Votre commande a été clôturée automatiquement. La livraison n’a pas été confirmée par le coursier.' ELSE v_body END; END IF;$s$||chr(10)||'  INSERT INTO public.notifications(user_id'); EXECUTE d;
 SELECT pg_get_functiondef('public.enqueue_order_notifications()'::regprocedure) INTO d;
 d:=replace(d,'IF v_counter THEN RETURN NEW; END IF;',$s$IF v_counter THEN RETURN NEW; END IF;
 IF NEW.delivery_mode='external' AND NEW.status IN ('on_the_way','delivered') THEN RETURN NEW; END IF;$s$); EXECUTE d;
 SELECT pg_get_functiondef('public.track_order(text,text)'::regprocedure) INTO d;
 d:=replace(d,$s$'order_number', o.order_number, 'status', o.status, 'order_type', o.order_type,$s$,$s$'order_number', o.order_number, 'status', o.status, 'order_type', o.order_type, 'delivery_mode', o.delivery_mode, 'auto_closed_at', o.auto_closed_at,$s$); EXECUTE d;
 SELECT pg_get_functiondef('public.stats_compute(uuid,date,date)'::regprocedure) INTO d;
 d:=replace(d,$s$'orders', (select count(*) from ok),$s$,$s$'orders', (select count(*) from ok), 'auto_closed', (select count(*) from ok where auto_closed_at is not null), 'confirmed_deliveries', (select count(*) from ok where order_type='delivery' and status='delivered' and auto_closed_at is null),$s$); EXECUTE d;
END $$;