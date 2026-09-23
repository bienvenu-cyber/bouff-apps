CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pawapay',
  provider_ref text,
  provider_correspondent text,
  phone text NOT NULL,
  amount_fcfa integer NOT NULL CHECK (amount_fcfa > 0),
  currency text NOT NULL DEFAULT 'XOF',
  status text NOT NULL DEFAULT 'pending',
  failure_reason text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_status_check CHECK (status IN ('pending','submitted','accepted','completed','failed','cancelled'))
);

CREATE UNIQUE INDEX payments_provider_ref_key ON public.payments (provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX payments_order_id_idx ON public.payments (order_id);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_staff" ON public.payments FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.user_roles ur ON ur.restaurant_id = o.restaurant_id
    WHERE o.id = payments.order_id
      AND ur.user_id = auth.uid()
      AND ur.role IN ('restaurant_admin'::app_role,'kitchen'::app_role)
  )
);

CREATE POLICY "payments_select_own_order" ON public.payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id AND o.customer_id = auth.uid()
  )
);

CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.notification_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event text NOT NULL,
  channel text NOT NULL,
  audience text NOT NULL,
  recipient text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notification_outbox_channel_check CHECK (channel IN ('whatsapp','email','sms')),
  CONSTRAINT notification_outbox_audience_check CHECK (audience IN ('customer','restaurant','rider')),
  CONSTRAINT notification_outbox_status_check CHECK (status IN ('pending','sent','failed','skipped'))
);

CREATE INDEX notification_outbox_pending_idx ON public.notification_outbox (status, created_at) WHERE status = 'pending';
CREATE INDEX notification_outbox_order_idx ON public.notification_outbox (order_id);

GRANT ALL ON public.notification_outbox TO service_role;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbox_select_super_admin" ON public.notification_outbox FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER notification_outbox_set_updated_at BEFORE UPDATE ON public.notification_outbox
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_order_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_restaurant record;
  v_payload jsonb;
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
    INSERT INTO public.notification_outbox (order_id, restaurant_id, event, channel, audience, recipient, payload)
    VALUES (NEW.id, NEW.restaurant_id, v_event, 'whatsapp', 'customer', NEW.customer_phone, v_payload);

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
$$;

CREATE TRIGGER orders_enqueue_notifications_insert
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_notifications();

CREATE TRIGGER orders_enqueue_notifications_update
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_notifications();