CREATE OR REPLACE FUNCTION public.notify_customer_in_app()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title text; v_body text;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  -- Vente au comptoir : le client est sur place, pas de notification dans l'app.
  IF NEW.source = 'counter' OR COALESCE(current_setting('bouff.counter', true), '') = '1' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_title := 'Commande ' || NEW.order_number;
  v_body := CASE NEW.status
    WHEN 'received' THEN 'Nous avons bien reçu votre commande.'
    WHEN 'in_kitchen' THEN 'Votre commande est en préparation en cuisine.'
    WHEN 'ready' THEN CASE WHEN NEW.order_type='takeaway' THEN 'Votre commande est prête, vous pouvez venir la récupérer.' ELSE 'Votre commande est prête, un livreur va la prendre.' END
    WHEN 'on_the_way' THEN 'Votre livreur est en route.'
    WHEN 'delivered' THEN CASE WHEN NEW.order_type='takeaway' THEN 'Commande récupérée. Bon appétit !' ELSE 'Commande livrée. Bon appétit !' END
    WHEN 'cancelled' THEN 'Votre commande a été annulée.' || COALESCE(' ' || NEW.cancel_reason, '')
  END;
  INSERT INTO public.notifications(user_id, order_id, title, body) VALUES (NEW.customer_id, NEW.id, v_title, v_body);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_customer_in_app() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_order_notifications()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_event text;
  v_restaurant record;
  v_payload jsonb;
  v_has_phone boolean := regexp_replace(COALESCE(NEW.customer_phone,''), '\D', '', 'g') !~ '^0+$';
  v_counter boolean := NEW.source = 'counter' OR COALESCE(current_setting('bouff.counter', true), '') = '1';
BEGIN
  -- Vente au comptoir : ni WhatsApp, ni e-mail (client et caissière sur place).
  IF v_counter THEN RETURN NEW; END IF;
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

  IF v_event IN ('order_received','status_cancelled') THEN
    INSERT INTO public.notification_outbox (order_id, restaurant_id, event, channel, audience, recipient, payload)
    VALUES (NEW.id, NEW.restaurant_id, v_event, 'whatsapp', 'restaurant',
            COALESCE(v_restaurant.whatsapp_number, v_restaurant.phone), v_payload);
  END IF;

  RETURN NEW;
END;
$function$;